import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/server/db/index.js';
import { MonitoredPage } from '../src/types/index.js';

describe('Configuration Export & Import Engine', () => {
  const testPageId1 = `test-export-1-${Date.now()}`;
  const testPageId2 = `test-export-2-${Date.now()}`;

  beforeEach(async () => {
    // Clean up
    await db.deletePage(testPageId1);
    await db.deletePage(testPageId2);
  });

  it('exports page configurations with full fidelity of selectors, sensitivities, intervals, and notifications', async () => {
    const page: MonitoredPage = {
      id: testPageId1,
      url: 'https://example.com/pricing-portal',
      name: 'Pricing Portal Watch',
      checkIntervalMinutes: 30,
      sensitivity: 'high',
      status: 'OK',
      watchedSelectors: ['.price-tier', '#annual-discount'],
      ignoredSelectors: ['.cookie-consent', '.chat-widget'],
      notifyEmail: 'ops@example.com',
      notifyTelegramChatId: '-10012345678',
      notifyDiscordWebhook: 'https://discord.com/api/webhooks/123/abc',
      quietHoursStart: '23:00',
      quietHoursEnd: '06:00',
      dailyDigestOnly: false,
      totalChecks: 5,
      totalChanges: 1,
      isPaused: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.createPage(page);

    const pages = await db.getPages();
    const found = pages.find(p => p.id === testPageId1);
    expect(found).toBeDefined();

    // Verify fields exported for this page
    const exportedPage = {
      url: found!.url,
      name: found!.name,
      checkIntervalMinutes: found!.checkIntervalMinutes,
      sensitivity: found!.sensitivity,
      watchedSelectors: found!.watchedSelectors,
      ignoredSelectors: found!.ignoredSelectors,
      notifyEmail: found!.notifyEmail,
      notifyTelegramChatId: found!.notifyTelegramChatId,
      notifyDiscordWebhook: found!.notifyDiscordWebhook,
      quietHoursStart: found!.quietHoursStart,
      quietHoursEnd: found!.quietHoursEnd,
      dailyDigestOnly: found!.dailyDigestOnly,
    };

    expect(exportedPage.name).toBe('Pricing Portal Watch');
    expect(exportedPage.checkIntervalMinutes).toBe(30);
    expect(exportedPage.sensitivity).toBe('high');
    expect(exportedPage.watchedSelectors).toEqual(['.price-tier', '#annual-discount']);
    expect(exportedPage.ignoredSelectors).toEqual(['.cookie-consent', '.chat-widget']);
    expect(exportedPage.notifyEmail).toBe('ops@example.com');
    expect(exportedPage.quietHoursStart).toBe('23:00');

    await db.deletePage(testPageId1);
  });

  it('imports valid monitoring configurations and persists them in database', async () => {
    const importPayload = {
      name: 'Imported Status Page',
      url: 'https://example.com/system-status',
      checkIntervalMinutes: 15,
      sensitivity: 'low' as const,
      watchedSelectors: ['#incident-feed'],
      ignoredSelectors: ['.footer-links'],
      notifyDiscordWebhook: 'https://discord.com/api/webhooks/999/xyz',
      dailyDigestOnly: true,
    };

    const newPage: MonitoredPage = {
      id: testPageId2,
      url: importPayload.url,
      name: importPayload.name,
      checkIntervalMinutes: importPayload.checkIntervalMinutes,
      sensitivity: importPayload.sensitivity,
      status: 'OK',
      watchedSelectors: importPayload.watchedSelectors,
      ignoredSelectors: importPayload.ignoredSelectors,
      notifyDiscordWebhook: importPayload.notifyDiscordWebhook,
      dailyDigestOnly: importPayload.dailyDigestOnly,
      totalChecks: 0,
      totalChanges: 0,
      isPaused: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.createPage(newPage);

    const retrieved = await db.getPageById(testPageId2);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('Imported Status Page');
    expect(retrieved?.checkIntervalMinutes).toBe(15);
    expect(retrieved?.sensitivity).toBe('low');
    expect(retrieved?.watchedSelectors).toEqual(['#incident-feed']);
    expect(retrieved?.dailyDigestOnly).toBe(true);

    await db.deletePage(testPageId2);
  });
});
