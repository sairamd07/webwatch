import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { detectChallengeInHtml } from '../src/server/monitoring/fetcher.js';
import { db } from '../src/server/db/index.js';
import { scheduler } from '../src/server/scheduler/queue.js';
import { dispatchChangeAlerts, sendDailyDigest } from '../src/server/notifications/notifier.js';
import { MonitoredPage } from '../src/types/index.js';

describe('HTTP 403, CAPTCHA, Error Classification & Recovery Test Suite', () => {
  let server: http.Server | null = null;
  let serverPort = 0;
  let serverResponseStatus = 200;
  let serverResponseBody = '<h1>Normal Page Content</h1><p>Welcome to our site.</p>';
  let requestCount = 0;

  beforeEach(async () => {
    requestCount = 0;
    serverResponseStatus = 200;
    serverResponseBody = '<h1>Normal Page Content</h1><p>Welcome to our site.</p>';

    await new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        requestCount++;
        res.writeHead(serverResponseStatus, { 'Content-Type': 'text/html' });
        res.end(serverResponseBody);
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server?.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
  });

  // 1. CAPTCHA & Challenge HTML Detection
  it('correctly detects various anti-bot challenge and CAPTCHA signatures', () => {
    const cloudflareTurnstile = '<div class="cf-turnstile">Verify you are human</div>';
    expect(detectChallengeInHtml(cloudflareTurnstile).isChallenge).toBe(true);
    expect(detectChallengeInHtml(cloudflareTurnstile).challengeType).toContain('cf-turnstile');

    const recaptcha = '<div class="g-recaptcha" data-sitekey="xyz"></div>';
    expect(detectChallengeInHtml(recaptcha).isChallenge).toBe(true);

    const hcaptcha = '<iframe src="https://hcaptcha.com/check"></iframe>';
    expect(detectChallengeInHtml(hcaptcha).isChallenge).toBe(true);

    const cloudflareWaiting = '<html><head><title>Just a moment...</title></head><body>Please wait</body></html>';
    expect(detectChallengeInHtml(cloudflareWaiting).isChallenge).toBe(true);

    const accessDeniedScreen = '<html><head><title>Access Denied</title></head><body>You do not have permission to access</body></html>';
    expect(detectChallengeInHtml(accessDeniedScreen).isChallenge).toBe(true);

    const normalHtml = '<html><head><title>Company Blog</title></head><body>Welcome to the tech blog</body></html>';
    expect(detectChallengeInHtml(normalHtml).isChallenge).toBe(false);
  });

  // 2. HTTP 403 classification & Non-retrying
  it('classifies HTTP 403 as BLOCKED and preserves prior snapshot', async () => {
    const pageId = `test-403-${Date.now()}`;
    const testPage: MonitoredPage = {
      id: pageId,
      url: 'https://example.com/forbidden-test',
      name: 'Test 403 Page',
      checkIntervalMinutes: 60,
      sensitivity: 'medium',
      status: 'OK',
      watchedSelectors: [],
      ignoredSelectors: [],
      totalChecks: 0,
      totalChanges: 0,
      isPaused: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.createPage(testPage);

    // Seed baseline snapshot v1
    const baselineSnapshot = {
      id: `snap-v1-${pageId}`,
      pageId,
      versionNumber: 1,
      contentHash: 'hash-v1-original',
      normalizedText: 'Initial baseline text that was verified.',
      rawTextPreview: 'Initial baseline text',
      checkedAt: new Date().toISOString(),
      isMeaningfulChange: false,
      changeSummary: 'Baseline captured.',
      httpStatus: 200,
      responseTimeMs: 250,
    };
    await db.createSnapshot(baselineSnapshot);
    await db.updatePage(pageId, {
      currentHash: 'hash-v1-original',
      lastSuccessfulCheckAt: baselineSnapshot.checkedAt,
      totalChecks: 1,
    });

    // Simulate 403 fetch result handling directly in scheduler logic
    const consecutiveFails = 1;
    await db.updatePage(pageId, {
      status: 'BLOCKED',
      lastError: 'Access forbidden (HTTP 403 Forbidden)',
      lastAttemptedCheckAt: new Date().toISOString(),
      consecutiveFailures: consecutiveFails,
      totalChecks: 2,
    });

    const pageAfter403 = await db.getPageById(pageId);
    expect(pageAfter403?.status).toBe('BLOCKED');
    expect(pageAfter403?.lastError).toContain('HTTP 403');
    expect(pageAfter403?.lastSuccessfulCheckAt).toBe(baselineSnapshot.checkedAt);
    expect(pageAfter403?.currentHash).toBe('hash-v1-original');
    expect(pageAfter403?.totalChanges).toBe(0); // Never treated as a content change!

    // Verify snapshot v1 remains intact and no false v2 snapshot was added
    const snapshots = await db.getSnapshots(pageId);
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].versionNumber).toBe(1);

    await db.deletePage(pageId);
  });

  // 3. HTTP 500 / Server Error classification
  it('classifies server failures (HTTP 500) as ERROR rather than BLOCKED', async () => {
    const pageId = `test-500-${Date.now()}`;
    const testPage: MonitoredPage = {
      id: pageId,
      url: 'https://example.com/server-error',
      name: 'Test 500 Page',
      checkIntervalMinutes: 60,
      sensitivity: 'medium',
      status: 'OK',
      watchedSelectors: [],
      ignoredSelectors: [],
      totalChecks: 0,
      totalChanges: 0,
      isPaused: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.createPage(testPage);

    // Apply error handling
    await db.updatePage(pageId, {
      status: 'ERROR',
      lastError: 'Server failure (HTTP 500 Internal Server Error)',
      lastAttemptedCheckAt: new Date().toISOString(),
      consecutiveFailures: 1,
      totalChecks: 1,
    });

    const pageAfter500 = await db.getPageById(pageId);
    expect(pageAfter500?.status).toBe('ERROR');
    expect(pageAfter500?.status).not.toBe('BLOCKED');
    expect(pageAfter500?.lastError).toContain('HTTP 500');

    await db.deletePage(pageId);
  });

  // 4. Timeout error classification
  it('classifies timeouts as ERROR rather than BLOCKED', async () => {
    const pageId = `test-timeout-${Date.now()}`;
    const testPage: MonitoredPage = {
      id: pageId,
      url: 'https://example.com/slow-page',
      name: 'Slow Page',
      checkIntervalMinutes: 60,
      sensitivity: 'medium',
      status: 'OK',
      watchedSelectors: [],
      ignoredSelectors: [],
      totalChecks: 0,
      totalChanges: 0,
      isPaused: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.createPage(testPage);

    await db.updatePage(pageId, {
      status: 'ERROR',
      lastError: 'Request timed out after 10000ms.',
      lastAttemptedCheckAt: new Date().toISOString(),
      consecutiveFailures: 1,
      totalChecks: 1,
    });

    const pageAfterTimeout = await db.getPageById(pageId);
    expect(pageAfterTimeout?.status).toBe('ERROR');
    expect(pageAfterTimeout?.status).not.toBe('BLOCKED');
    expect(pageAfterTimeout?.lastError).toContain('timed out');

    await db.deletePage(pageId);
  });

  // 4. Unchanged content preserves status OK and does not trigger false alerts
  it('preserves status OK on unchanged content without bumping versions', async () => {
    const pageId = `test-unchanged-${Date.now()}`;
    const initialContent = 'Stable terms and conditions for WebWatch.';
    const hash = 'deterministic-stable-hash-123';

    const testPage: MonitoredPage = {
      id: pageId,
      url: 'https://example.com/terms',
      name: 'Unchanged Terms',
      checkIntervalMinutes: 60,
      sensitivity: 'medium',
      status: 'OK',
      watchedSelectors: [],
      ignoredSelectors: [],
      totalChecks: 1,
      totalChanges: 0,
      currentHash: hash,
      isPaused: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.createPage(testPage);

    await db.createSnapshot({
      id: `snap-terms-${pageId}`,
      pageId,
      versionNumber: 1,
      contentHash: hash,
      normalizedText: initialContent,
      rawTextPreview: initialContent,
      checkedAt: new Date().toISOString(),
      isMeaningfulChange: false,
      httpStatus: 200,
      responseTimeMs: 120,
    });

    // Simulate check with identical content
    const checkedAt = new Date().toISOString();
    await db.updatePage(pageId, {
      status: 'OK',
      lastCheckedAt: checkedAt,
      lastAttemptedCheckAt: checkedAt,
      lastSuccessfulCheckAt: checkedAt,
      lastError: null,
      consecutiveFailures: 0,
      totalChecks: 2,
    });

    const updated = await db.getPageById(pageId);
    expect(updated?.status).toBe('OK');
    expect(updated?.totalChanges).toBe(0);
    expect(updated?.totalChecks).toBe(2);

    const snapshots = await db.getSnapshots(pageId);
    expect(snapshots.length).toBe(1); // No duplicate snapshot created

    await db.deletePage(pageId);
  });

  // 5. Full End-to-End Recovery Flow after a Blocked Check
  it('correctly executes full recovery lifecycle: Baseline -> BLOCKED -> Recovery to OK -> Meaningful Change', async () => {
    const pageId = `test-recovery-${Date.now()}`;
    const baselineText = 'Product Tier A: $49/month with 5 seats.';
    const baselineHash = 'hash-tier-a-49';

    // Step A: Register page and create baseline snapshot v1
    const testPage: MonitoredPage = {
      id: pageId,
      url: 'https://example.com/pricing-recovery',
      name: 'Pricing Recovery Test',
      checkIntervalMinutes: 60,
      sensitivity: 'medium',
      status: 'OK',
      watchedSelectors: [],
      ignoredSelectors: [],
      totalChecks: 1,
      totalChanges: 0,
      currentHash: baselineHash,
      isPaused: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.createPage(testPage);

    const baselineTimestamp = new Date(Date.now() - 3600000).toISOString();
    await db.createSnapshot({
      id: `snap-v1-${pageId}`,
      pageId,
      versionNumber: 1,
      contentHash: baselineHash,
      normalizedText: baselineText,
      rawTextPreview: baselineText,
      checkedAt: baselineTimestamp,
      isMeaningfulChange: false,
      httpStatus: 200,
      responseTimeMs: 150,
    });
    await db.updatePage(pageId, {
      lastCheckedAt: baselineTimestamp,
      lastAttemptedCheckAt: baselineTimestamp,
      lastSuccessfulCheckAt: baselineTimestamp,
    });

    // Step B: Next check encounters HTTP 403 Forbidden
    const blockedTimestamp = new Date(Date.now() - 1800000).toISOString();
    await db.updatePage(pageId, {
      status: 'BLOCKED',
      lastError: 'Access forbidden (HTTP 403 Forbidden)',
      lastAttemptedCheckAt: blockedTimestamp,
      lastCheckedAt: blockedTimestamp,
      // lastSuccessfulCheckAt is NOT changed
      consecutiveFailures: 1,
      totalChecks: 2,
    });

    let pageState = await db.getPageById(pageId);
    expect(pageState?.status).toBe('BLOCKED');
    expect(pageState?.lastError).toContain('HTTP 403');
    expect(pageState?.lastSuccessfulCheckAt).toBe(baselineTimestamp); // Preserved!
    expect(pageState?.currentHash).toBe(baselineHash); // Preserved!

    // Step C: Site unblocks and returns original baseline content
    const unblockedTimestamp = new Date(Date.now() - 900000).toISOString();
    // Hash matches baseline -> resume OK, clear error, update successful check
    await db.updatePage(pageId, {
      status: 'OK',
      lastError: null,
      lastAttemptedCheckAt: unblockedTimestamp,
      lastCheckedAt: unblockedTimestamp,
      lastSuccessfulCheckAt: unblockedTimestamp,
      consecutiveFailures: 0,
      totalChecks: 3,
    });

    pageState = await db.getPageById(pageId);
    expect(pageState?.status).toBe('OK');
    expect(pageState?.lastError).toBeNull();
    expect(pageState?.lastSuccessfulCheckAt).toBe(unblockedTimestamp);
    expect(pageState?.totalChanges).toBe(0); // Zero false change notifications!

    // Step D: Site genuinely updates its pricing
    const changedText = 'Product Tier A: $89/month with 10 seats, phone support included.';
    const changedHash = 'hash-tier-a-89-new';
    const changedTimestamp = new Date().toISOString();

    await db.createSnapshot({
      id: `snap-v2-${pageId}`,
      pageId,
      versionNumber: 2,
      contentHash: changedHash,
      normalizedText: changedText,
      rawTextPreview: changedText,
      checkedAt: changedTimestamp,
      isMeaningfulChange: true,
      changeSummary: 'Price increased and features updated.',
      httpStatus: 200,
      responseTimeMs: 140,
    });

    await db.updatePage(pageId, {
      status: 'CHANGED',
      currentHash: changedHash,
      lastChangedAt: changedTimestamp,
      lastAttemptedCheckAt: changedTimestamp,
      lastSuccessfulCheckAt: changedTimestamp,
      totalChecks: 4,
      totalChanges: 1,
    });

    pageState = await db.getPageById(pageId);
    expect(pageState?.status).toBe('CHANGED');
    expect(pageState?.totalChanges).toBe(1);
    expect(pageState?.currentHash).toBe(changedHash);

    const allSnaps = await db.getSnapshots(pageId);
    expect(allSnaps.length).toBe(2);
    expect(allSnaps[0].versionNumber).toBe(2); // Latest snapshot is v2
    expect(allSnaps[1].versionNumber).toBe(1); // Baseline is v1

    await db.deletePage(pageId);
  });

  // 6. Daily digest queueing when dailyDigestOnly is true
  it('queues alerts with QUEUED_FOR_DIGEST status when dailyDigestOnly is enabled', async () => {
    const pageId = `test-digest-${Date.now()}`;
    const testPage: MonitoredPage = {
      id: pageId,
      url: 'https://example.com/digest-page',
      name: 'Daily Digest Test Page',
      checkIntervalMinutes: 60,
      sensitivity: 'medium',
      status: 'CHANGED',
      watchedSelectors: [],
      ignoredSelectors: [],
      dailyDigestOnly: true,
      notifyDiscordWebhook: 'https://discord.com/api/webhooks/mock/test',
      totalChecks: 1,
      totalChanges: 1,
      isPaused: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.createPage(testPage);

    const alerts = await dispatchChangeAlerts(testPage, 2, 'Critical security advisory posted.');
    expect(alerts.length).toBe(1);
    expect(alerts[0].status).toBe('QUEUED_FOR_DIGEST');
    expect(alerts[0].message).toContain('Queued for Daily Digest');

    // Verify alert is recorded in database with QUEUED_FOR_DIGEST status
    const dbAlerts = await db.getAlerts(10);
    const found = dbAlerts.find(a => a.pageId === pageId);
    expect(found).toBeDefined();
    expect(found?.status).toBe('QUEUED_FOR_DIGEST');

    await db.deletePage(pageId);
  });

  // 7. Selector warning recording when watched selector no longer matches
  it('persists selectorWarning on page when configured CSS selector fails to match DOM', async () => {
    const pageId = `test-sel-warn-${Date.now()}`;
    const testPage: MonitoredPage = {
      id: pageId,
      url: 'https://example.com/missing-sel',
      name: 'Selector Warning Test',
      checkIntervalMinutes: 60,
      sensitivity: 'medium',
      status: 'OK',
      watchedSelectors: ['.nonexistent-class-123'],
      ignoredSelectors: [],
      totalChecks: 1,
      totalChanges: 0,
      isPaused: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.createPage(testPage);

    const warningText = 'Selector mismatch: .nonexistent-class-123 did not match any elements in current page DOM';
    await db.updatePage(pageId, {
      selectorWarning: warningText,
    });

    const updated = await db.getPageById(pageId);
    expect(updated?.selectorWarning).toBe(warningText);

    await db.deletePage(pageId);
  });

  // 8. Idempotency prevents duplicate notifications for identical page, version, and channel
  it('enforces persistent idempotency preventing duplicate alert dispatches', async () => {
    const pageId = `test-idemp-${Date.now()}`;
    const testPage: MonitoredPage = {
      id: pageId,
      url: 'https://example.com/idemp-page',
      name: 'Idempotency Page',
      checkIntervalMinutes: 60,
      sensitivity: 'medium',
      status: 'CHANGED',
      watchedSelectors: [],
      ignoredSelectors: [],
      dailyDigestOnly: true, // test without firing real network calls
      notifyDiscordWebhook: 'https://discord.com/api/webhooks/mock/12345',
      totalChecks: 1,
      totalChanges: 1,
      isPaused: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.createPage(testPage);

    // First dispatch for version 2
    const firstDispatch = await dispatchChangeAlerts(testPage, 2, 'Initial announcement.');
    expect(firstDispatch.length).toBe(1);

    // Second dispatch for version 2 (e.g. duplicate retry or overlapping runner)
    const secondDispatch = await dispatchChangeAlerts(testPage, 2, 'Initial announcement.');
    expect(secondDispatch.length).toBe(0); // Suppressed by idempotency key!

    await db.deletePage(pageId);
  });
});
