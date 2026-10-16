import crypto from 'crypto';
import { db } from '../db/index.js';
import { fetchWebPage, FetchResult } from '../monitoring/fetcher.js';
import { extractAndNormalizeContent } from '../monitoring/normalizer.js';
import { computeContentHash, isMeaningfulChange } from '../monitoring/hasher.js';
import { computeScreenshotDiff } from '../diff/imageDiff.js';
import { dispatchChangeAlerts, sendDailyDigest } from '../notifications/notifier.js';
import { MonitoredPage, PageSnapshot } from '../../types/index.js';
import { config } from '../config.js';

class MonitoringScheduler {
  private inFlightPageChecks = new Set<string>();
  private inFlightUrlPromises = new Map<string, Promise<FetchResult>>();
  private domainLastFetchedAt = new Map<string, number>();
  private isRunning = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private activeJobsCount = 0;
  private lastDailyDigestAt = Date.now();

  constructor() {
    this.start();
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[Scheduler] Background monitoring scheduler initialized.');

    // Poll for scheduled pages every 10 seconds
    this.intervalTimer = setInterval(() => {
      this.tick();
    }, 10000);

    // Initial tick after short delay
    setTimeout(() => this.tick(), 2000);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  private async tick() {
    if (!this.isRunning) return;

    try {
      const pages = await db.getPages();
      const now = Date.now();

      for (const page of pages) {
        if (page.isPaused) continue;

        const nextCheck = page.nextCheckAt ? new Date(page.nextCheckAt).getTime() : 0;
        if (nextCheck <= now && !this.inFlightPageChecks.has(page.id)) {
          // Schedule check with concurrency limiter
          if (this.activeJobsCount < config.maxConcurrentChecks) {
            this.runPageCheck(page.id, false).catch(err => {
              console.error(`[Scheduler] Check error for page ${page.id}:`, err);
            });
          }
        }
      }

      // Check if 24 hours have elapsed for daily digest
      if (now - this.lastDailyDigestAt >= 24 * 60 * 60 * 1000) {
        this.lastDailyDigestAt = now;
        sendDailyDigest().catch(err => {
          console.error('[Scheduler] Automatic daily digest error:', err);
        });
      }
      // Clean up expired shared fetches
      db.cleanupExpiredSharedFetches().catch(() => {});
    } catch (err) {
      console.error('[Scheduler] Tick loop error:', err);
    }
  }

  /**
   * Triggers an immediate or scheduled check for a monitored page.
   */
  async runPageCheck(pageId: string, isManual = false): Promise<{ success: boolean; message: string; versionBumped?: boolean }> {
    const page = await db.getPageById(pageId);
    if (!page) {
      return { success: false, message: 'Page not found' };
    }

    if (this.inFlightPageChecks.has(pageId)) {
      return { success: false, message: 'Check is already running for this page' };
    }

    this.inFlightPageChecks.add(pageId);
    this.activeJobsCount++;

    try {
      let domain = '';
      try {
        domain = new URL(page.url).hostname;
      } catch {
        domain = 'unknown';
      }

      // Per-domain rate limiting guard: wait if same domain was queried less than 4 seconds ago
      const lastDomainTime = this.domainLastFetchedAt.get(domain) || 0;
      const domainDelta = Date.now() - lastDomainTime;
      if (domainDelta < 4000) {
        await new Promise(resolve => setTimeout(resolve, 4000 - domainDelta));
      }
      this.domainLastFetchedAt.set(domain, Date.now());

      // 1. Check persistent shared URL fetches across workers/users (for scheduled checks)
      let fetchResult: FetchResult | null = null;
      if (!isManual) {
        fetchResult = await db.getSharedFetch(page.url);
      }

      // 2. If no fresh shared fetch exists, perform real fetch with in-flight deduplication
      if (!fetchResult) {
        let fetchPromise = this.inFlightUrlPromises.get(page.url);
        if (!fetchPromise) {
          fetchPromise = fetchWebPage(page.url, page.id).then(async res => {
            if (res.success) {
              await db.saveSharedFetch(page.url, res, 60).catch(() => {});
            }
            return res;
          });
          this.inFlightUrlPromises.set(page.url, fetchPromise);
          fetchPromise.finally(() => {
            this.inFlightUrlPromises.delete(page.url);
          });
        }
        fetchResult = await fetchPromise;
      }

      const checkedAt = new Date().toISOString();
      const currentChecks = (page.totalChecks || 0) + 1;

      // Calculate next check time with randomized scheduling jitter (±20s)
      const intervalMs = Math.max(config.minCheckIntervalMinutes, page.checkIntervalMinutes) * 60 * 1000;
      const jitterMs = Math.floor(Math.random() * 40000) - 20000;
      const nextCheckAt = new Date(Date.now() + intervalMs + jitterMs).toISOString();

      // Handle Failure / Block / CAPTCHA cases
      if (!fetchResult.success) {
        const errorStatus = fetchResult.isBlocked ? 'BLOCKED' : 'ERROR';
        const errorDetail = fetchResult.error || fetchResult.blockReason || 'Unknown fetching error';
        const consecutiveFails = (page.consecutiveFailures || 0) + 1;

        // Exponential backoff for future scheduled checks on blocked sites (avoid hammering 403 endpoints)
        const backoffFactor = fetchResult.isBlocked ? Math.min(8, Math.pow(2, Math.min(consecutiveFails, 3))) : 1;
        const backedOffIntervalMs = intervalMs * backoffFactor;
        const nextCheckAt = new Date(Date.now() + backedOffIntervalMs + jitterMs).toISOString();

        await db.updatePage(page.id, {
          status: errorStatus,
          lastError: errorDetail,
          lastCheckedAt: checkedAt,
          lastAttemptedCheckAt: checkedAt,
          nextCheckAt,
          consecutiveFailures: consecutiveFails,
          totalChecks: currentChecks,
        });

        return {
          success: false,
          message: `Check failed (${errorStatus}): ${errorDetail}`,
        };
      }

      // Successful fetch -> parse and normalize content
      const { normalizedText, rawPreview, title, unmatchedSelectors } = extractAndNormalizeContent(
        fetchResult.html,
        {
          watchedSelectors: page.watchedSelectors || [],
          ignoredSelectors: page.ignoredSelectors || [],
        }
      );

      let selectorWarning: string | null = null;
      if (page.watchedSelectors && page.watchedSelectors.length > 0 && unmatchedSelectors && unmatchedSelectors.length > 0) {
        selectorWarning = `Selector mismatch: ${unmatchedSelectors.join(', ')} did not match any elements in current page DOM`;
      }

      const contentHash = computeContentHash(normalizedText);
      const latestSnapshot = await db.getLatestSnapshot(page.id);
      const lastSuccessfulCheckAt = checkedAt;

      // Scenario 1: First snapshot (Baseline)
      if (!latestSnapshot) {
        const initialSnapshot: PageSnapshot = {
          id: crypto.randomUUID(),
          pageId: page.id,
          versionNumber: 1,
          contentHash,
          normalizedText,
          rawTextPreview: rawPreview,
          screenshotUrl: fetchResult.screenshotUrl,
          screenshotPath: fetchResult.screenshotPath,
          checkedAt,
          isMeaningfulChange: false,
          changeSummary: 'Initial baseline snapshot captured.',
          httpStatus: fetchResult.httpStatus,
          responseTimeMs: fetchResult.responseTimeMs,
          extractedTitle: title,
        };

        await db.createSnapshot(initialSnapshot);
        await db.updatePage(page.id, {
          status: 'OK',
          lastCheckedAt: checkedAt,
          lastAttemptedCheckAt: checkedAt,
          lastSuccessfulCheckAt,
          lastChangedAt: checkedAt,
          nextCheckAt,
          currentHash: contentHash,
          lastError: null,
          selectorWarning,
          consecutiveFailures: 0,
          totalChecks: currentChecks,
          totalChanges: 0,
        });

        return {
          success: true,
          message: 'Baseline snapshot successfully captured (v1).',
          versionBumped: false,
        };
      }

      // Scenario 2: Content Hash is identical to latest snapshot
      if (latestSnapshot.contentHash === contentHash) {
        await db.updatePage(page.id, {
          status: 'OK',
          lastCheckedAt: checkedAt,
          lastAttemptedCheckAt: checkedAt,
          lastSuccessfulCheckAt,
          nextCheckAt,
          lastError: null,
          selectorWarning,
          consecutiveFailures: 0,
          totalChecks: currentChecks,
        });

        return {
          success: true,
          message: 'Page checked. Content is unchanged.',
          versionBumped: false,
        };
      }

      // Scenario 3: Content Hash differs -> Evaluate meaningful change
      let visualDiffPercent = 0;
      if (latestSnapshot.screenshotPath && fetchResult.screenshotPath) {
        const visualDiff = await computeScreenshotDiff(
          latestSnapshot.screenshotPath,
          fetchResult.screenshotPath,
          page.id
        );
        visualDiffPercent = visualDiff.diffPercentage;
      }

      const evaluation = isMeaningfulChange(
        latestSnapshot.normalizedText,
        normalizedText,
        page.sensitivity,
        visualDiffPercent
      );

      if (evaluation.isMeaningful) {
        // Real meaningful change detected!
        const nextVersion = latestSnapshot.versionNumber + 1;
        const changeSummary = evaluation.reason;

        const newSnapshot: PageSnapshot = {
          id: crypto.randomUUID(),
          pageId: page.id,
          versionNumber: nextVersion,
          contentHash,
          normalizedText,
          rawTextPreview: rawPreview,
          screenshotUrl: fetchResult.screenshotUrl,
          screenshotPath: fetchResult.screenshotPath,
          checkedAt,
          isMeaningfulChange: true,
          changeSummary,
          httpStatus: fetchResult.httpStatus,
          responseTimeMs: fetchResult.responseTimeMs,
          extractedTitle: title,
        };

        await db.createSnapshot(newSnapshot);

        const updatedPage = await db.updatePage(page.id, {
          status: 'CHANGED',
          lastCheckedAt: checkedAt,
          lastAttemptedCheckAt: checkedAt,
          lastSuccessfulCheckAt,
          lastChangedAt: checkedAt,
          nextCheckAt,
          currentHash: contentHash,
          lastError: null,
          selectorWarning,
          consecutiveFailures: 0,
          totalChecks: currentChecks,
          totalChanges: (page.totalChanges || 0) + 1,
        });

        // Dispatch notifications with idempotency and quiet hours enforcement
        if (updatedPage) {
          dispatchChangeAlerts(updatedPage, nextVersion, changeSummary).catch(err => {
            console.error('[Scheduler] Alert dispatch error:', err);
          });
        }

        return {
          success: true,
          message: `Meaningful change detected: ${changeSummary} (New version v${nextVersion})`,
          versionBumped: true,
        };
      } else {
        // Trivial difference below sensitivity threshold
        await db.updatePage(page.id, {
          status: 'OK',
          lastCheckedAt: checkedAt,
          lastAttemptedCheckAt: checkedAt,
          lastSuccessfulCheckAt,
          nextCheckAt,
          lastError: null,
          selectorWarning,
          consecutiveFailures: 0,
          totalChecks: currentChecks,
        });

        return {
          success: true,
          message: `Check completed: ${evaluation.reason} (Ignored as noise)`,
          versionBumped: false,
        };
      }
    } finally {
      this.inFlightPageChecks.delete(pageId);
      this.activeJobsCount = Math.max(0, this.activeJobsCount - 1);
    }
  }

  getQueueStats() {
    const isRedis = Boolean(config.redisUrl && config.redisUrl.trim().length > 0);
    return {
      type: (isRedis ? 'bullmq_redis' : 'internal_priority') as 'bullmq_redis' | 'internal_priority',
      activeJobs: this.activeJobsCount,
      waitingJobs: this.inFlightPageChecks.size,
      inFlightUrls: this.inFlightUrlPromises.size,
      isRedisConnected: isRedis,
      modeDescription: isRedis
        ? 'Dedicated Redis BullMQ queue worker running.'
        : 'Local In-Process Priority Scheduler active. Checks run while the Node server is active. On ephemeral/serverless runtimes that pause CPU during idle, manual checks (Check Now) execute on-demand.',
    };
  }
}

export const scheduler = new MonitoringScheduler();
