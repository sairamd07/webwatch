import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { db } from '../src/server/db/index.js';
import { MonitoredPage, PageSnapshot, AlertNotification } from '../src/types/index.js';

describe('Target Page and History Deletion', () => {
  const pageId = `del-test-${Date.now()}`;

  beforeEach(async () => {
    await db.deletePage(pageId);
  });

  it('successfully creates, cascades, and deletes a monitored page with its snapshots and alerts', async () => {
    const now = new Date().toISOString();
    const testPage: MonitoredPage = {
      id: pageId,
      url: 'https://delete-verification.example.com',
      name: 'Delete Verification Target',
      checkIntervalMinutes: 30,
      sensitivity: 'medium',
      status: 'OK',
      watchedSelectors: ['main', '.content'],
      ignoredSelectors: ['.ad-banner'],
      totalChecks: 2,
      totalChanges: 1,
      isPaused: false,
      createdAt: now,
      updatedAt: now,
      nextCheckAt: now,
    };

    // 1. Create page
    await db.createPage(testPage);
    const fetchedPage = await db.getPageById(pageId);
    expect(fetchedPage).not.toBeNull();
    expect(fetchedPage?.name).toBe('Delete Verification Target');

    // 2. Attach snapshots
    const snap1: PageSnapshot = {
      id: crypto.randomUUID(),
      pageId: pageId,
      versionNumber: 1,
      contentHash: 'hash-v1',
      normalizedText: 'Initial baseline text content',
      rawTextPreview: 'Initial baseline text content',
      screenshotUrl: '/screenshots/snap1.png',
      screenshotPath: '/tmp/snap1.png',
      checkedAt: now,
      isMeaningfulChange: false,
      httpStatus: 200,
      responseTimeMs: 120,
      extractedTitle: 'Baseline Page',
    };
    await db.createSnapshot(snap1);

    const snapshotsBefore = await db.getSnapshots(pageId);
    expect(snapshotsBefore.length).toBe(1);

    // 3. Attach alert notifications
    const alert1: AlertNotification = {
      id: crypto.randomUUID(),
      pageId: pageId,
      pageName: testPage.name,
      pageUrl: testPage.url,
      versionNumber: 1,
      channel: 'discord',
      destination: 'https://discord.com/api/webhooks/123/xyz',
      status: 'SENT',
      message: 'Baseline check completed',
      sentAt: now,
      idempotencyKey: `${pageId}:del-test:alert1`,
    };
    await db.createAlert(alert1);

    // 4. Delete the page
    const deleteResult = await db.deletePage(pageId);
    expect(deleteResult).toBe(true);

    // 5. Verify page is gone
    const pageAfter = await db.getPageById(pageId);
    expect(pageAfter).toBeNull();

    // 6. Verify cascading snapshots are gone
    const snapshotsAfter = await db.getSnapshots(pageId);
    expect(snapshotsAfter.length).toBe(0);

    // 7. Attempting to delete again returns false
    const deleteAgain = await db.deletePage(pageId);
    expect(deleteAgain).toBe(false);
  });

  it('can clear alert logs successfully', async () => {
    const clearResult = await db.clearAlerts();
    expect(clearResult).toBe(true);

    const alerts = await db.getAlerts(10);
    expect(alerts.length).toBe(0);
  });
});
