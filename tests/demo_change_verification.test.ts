import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import express from 'express';
import { db } from '../src/server/db/index.js';
import { scheduler } from '../src/server/scheduler/queue.js';
import { demoRouter } from '../src/server/routes/demo.js';
import { computeTextDiff } from '../src/server/diff/textDiff.js';
import { MonitoredPage } from '../src/types/index.js';

describe('Live Example Link & Dynamic Content Change Verification', () => {
  let server: http.Server;
  let testPort = 0;
  const pageId = `demo-verify-${Date.now()}`;

  beforeAll(async () => {
    // Spin up an Express test server with demoRouter mounted
    const app = express();
    app.use(express.json());
    app.use('/demo', demoRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          testPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await db.deletePage(pageId);
    if (server) {
      server.close();
    }
  });

  it('detects live content changes on an example link, generates diffs, and updates version history', async () => {
    const demoUrl = `http://127.0.0.1:${testPort}/demo/sample-page`;

    // Step 1: Reset demo page to Version 1 (Baseline: $49/mo)
    const resetRes = await fetch(`http://127.0.0.1:${testPort}/demo/sample-page/reset`, { method: 'POST' });
    expect(resetRes.ok).toBe(true);

    const now = new Date().toISOString();
    const testPage: MonitoredPage = {
      id: pageId,
      url: demoUrl,
      name: 'Apex Cloud Services [Live Verification]',
      checkIntervalMinutes: 15,
      sensitivity: 'medium',
      status: 'OK',
      watchedSelectors: ['#page-title', '#plan-price', '#page-announcement', '#features-list'],
      ignoredSelectors: [],
      totalChecks: 0,
      totalChanges: 0,
      isPaused: false,
      createdAt: now,
      updatedAt: now,
      nextCheckAt: now,
    };

    await db.createPage(testPage);

    // Step 2: Run Baseline Check (Check #1)
    const check1Result = await scheduler.runPageCheck(pageId, true);
    expect(check1Result.success).toBe(true);
    expect(check1Result.message).toContain('Baseline snapshot successfully captured (v1)');

    const snap1 = await db.getLatestSnapshot(pageId);
    expect(snap1).not.toBeNull();
    expect(snap1?.versionNumber).toBe(1);
    expect(snap1?.normalizedText).toContain('49');

    const pageAfterCheck1 = await db.getPageById(pageId);
    expect(pageAfterCheck1?.status).toBe('OK');
    expect(pageAfterCheck1?.totalChecks).toBe(1);
    expect(pageAfterCheck1?.totalChanges).toBe(0);

    // Step 3: Mutate live content on the example link (Version 1 -> Version 2: Price $89/mo, new features)
    const changeRes = await fetch(`http://127.0.0.1:${testPort}/demo/sample-page/change`, { method: 'POST' });
    expect(changeRes.ok).toBe(true);
    const changeData = await changeRes.json();
    expect(changeData.state.version).toBe(2);
    expect(changeData.state.price).toBe('$89');

    // Step 4: Run Check #2 on WebWatch
    const check2Result = await scheduler.runPageCheck(pageId, true);
    expect(check2Result.success).toBe(true);
    expect(check2Result.versionBumped).toBe(true);

    const snap2 = await db.getLatestSnapshot(pageId);
    expect(snap2).not.toBeNull();
    expect(snap2?.versionNumber).toBe(2);
    expect(snap2?.normalizedText).toContain('89');

    const pageAfterCheck2 = await db.getPageById(pageId);
    expect(pageAfterCheck2?.status).toBe('CHANGED');
    expect(pageAfterCheck2?.totalChecks).toBe(2);
    expect(pageAfterCheck2?.totalChanges).toBe(1);

    // Step 5: Verify Text Diff between Version 1 and Version 2
    const diff = computeTextDiff(snap1!.normalizedText, snap2!.normalizedText);
    expect(diff.addedWords).toBeGreaterThan(0);
    expect(diff.removedWords).toBeGreaterThan(0);

    // Added text includes the price increase and upgraded capabilities
    const addedLines = diff.lines.filter(l => l.type === 'added').map(l => l.value).join(' ');
    expect(addedLines).toMatch(/89/);

    // Step 6: Verify unchanged check does NOT create a redundant version 3
    const check3Result = await scheduler.runPageCheck(pageId, true);
    expect(check3Result.success).toBe(true);
    expect(check3Result.versionBumped).toBe(false);
    expect(check3Result.message).toContain('unchanged');

    const snapshots = await db.getSnapshots(pageId);
    expect(snapshots.length).toBe(2); // Still exactly 2 snapshots!
  }, 30000);
});
