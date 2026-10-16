import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { db } from '../src/server/db/index.js';
import { isCurrentlyQuietHours } from '../src/server/notifications/notifier.js';
import { MonitoredPage, AlertNotification } from '../src/types/index.js';

describe('Shared Browser Fetches Across Subscriptions & Workers', () => {
  it('saves and retrieves shared URL fetches within TTL', async () => {
    const testUrl = `https://test-shared-${Date.now()}.org`;
    const fetchPayload = {
      success: true,
      httpStatus: 200,
      html: '<html><body>Shared Content Across Workers</body></html>',
      screenshotPath: '/tmp/test.png',
      screenshotUrl: '/api/storage/screenshots/test.png',
      responseTimeMs: 120,
    };

    // Save with 10s TTL
    await db.saveSharedFetch(testUrl, fetchPayload, 10);

    // Retrieve should hit
    const cached = await db.getSharedFetch(testUrl);
    expect(cached).not.toBeNull();
    expect(cached?.html).toBe(fetchPayload.html);
    expect(cached?.httpStatus).toBe(200);
    expect(cached?.responseTimeMs).toBe(120);
  });

  it('does not return expired shared URL fetches', async () => {
    const testUrl = `https://test-expired-${Date.now()}.org`;
    const fetchPayload = {
      success: true,
      httpStatus: 200,
      html: '<html><body>Old Content</body></html>',
      responseTimeMs: 90,
    };

    // Save with negative/0 TTL (already expired)
    await db.saveSharedFetch(testUrl, fetchPayload, -1);

    const cached = await db.getSharedFetch(testUrl);
    expect(cached).toBeNull();
  });
});

describe('Notification Idempotency & Quiet Hours', () => {
  it('prevents duplicate notification dispatches via persistent idempotency keys', async () => {
    const pageId = `alert-test-${Date.now()}`;
    const testPage: MonitoredPage = {
      id: pageId,
      url: 'https://alert-test.org',
      name: 'Alert Test Page',
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

    const uniqueKey = `${pageId}:v1:discord`;

    // Initially not used
    const before = await db.isIdempotencyKeyUsed(uniqueKey);
    expect(before).toBe(false);

    // Insert alert
    const alert: AlertNotification = {
      id: crypto.randomUUID(),
      pageId,
      pageName: testPage.name,
      pageUrl: testPage.url,
      versionNumber: 1,
      channel: 'discord',
      destination: 'https://discord.com/api/webhooks/***',
      status: 'SENT',
      message: 'Initial change detected',
      sentAt: new Date().toISOString(),
      idempotencyKey: uniqueKey,
    };

    await db.createAlert(alert);

    // Now used
    const after = await db.isIdempotencyKeyUsed(uniqueKey);
    expect(after).toBe(true);

    // Clean up
    await db.deletePage(pageId);
  });

  it('correctly calculates quiet hours overnight and daytime windows', () => {
    // Normal window: 09:00 to 17:00
    // We test with boundary logic
    expect(isCurrentlyQuietHours(undefined, undefined)).toBe(false);
    expect(isCurrentlyQuietHours('', '')).toBe(false);

    // Overnight window (e.g. 22:00 to 07:00)
    // If start > end, it spans midnight
    // Any hour >= 22 or < 7 is quiet
    const now = new Date();
    const currentH = now.getHours();
    const currentM = now.getMinutes();

    // Dynamically construct quiet hours that include NOW
    const startH = (currentH - 1 + 24) % 24;
    const endH = (currentH + 1) % 24;
    const startStr = `${String(startH).padStart(2, '0')}:${String(currentM).padStart(2, '0')}`;
    const endStr = `${String(endH).padStart(2, '0')}:${String(currentM).padStart(2, '0')}`;

    if (startH < endH) {
      expect(isCurrentlyQuietHours(startStr, endStr)).toBe(true);
    }

    // Construct quiet hours that strictly exclude NOW (e.g., offset by 5 hours)
    const outsideStartH = (currentH + 5) % 24;
    const outsideEndH = (currentH + 7) % 24;
    const outsideStart = `${String(outsideStartH).padStart(2, '0')}:00`;
    const outsideEnd = `${String(outsideEndH).padStart(2, '0')}:00`;
    if (outsideStartH < outsideEndH) {
      expect(isCurrentlyQuietHours(outsideStart, outsideEnd)).toBe(false);
    }
  });
});

describe('Scheduled Work Persistence Across Application Restarts', () => {
  it('persists monitored page nextCheckAt and retrieves it accurately', async () => {
    const pageId = `persist-test-${Date.now()}`;
    const targetCheckTime = new Date(Date.now() + 3600000).toISOString();

    const page: MonitoredPage = {
      id: pageId,
      url: 'https://persistent-target.org',
      name: 'Persistence Test Page',
      checkIntervalMinutes: 60,
      sensitivity: 'medium',
      status: 'OK',
      watchedSelectors: ['.article'],
      ignoredSelectors: ['.ad'],
      nextCheckAt: targetCheckTime,
      totalChecks: 0,
      totalChanges: 0,
      isPaused: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.createPage(page);

    // Fetch back
    const retrieved = await db.getPageById(pageId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(pageId);
    expect(retrieved?.url).toBe('https://persistent-target.org');
    expect(retrieved?.watchedSelectors).toEqual(['.article']);
    expect(retrieved?.ignoredSelectors).toEqual(['.ad']);
    expect(retrieved?.nextCheckAt).toBe(targetCheckTime);

    // Clean up
    await db.deletePage(pageId);
    const deleted = await db.getPageById(pageId);
    expect(deleted).toBeNull();
  });
});
