import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../db/index.js';
import { scheduler } from '../scheduler/queue.js';
import { MonitoredPage } from '../../types/index.js';

export const demoRouter = Router();

export interface DemoContentState {
  version: number;
  badge: string;
  title: string;
  headline: string;
  planName: string;
  price: string;
  billingCycle: string;
  announcement: string;
  features: string[];
  systemStatus: string;
  lastUpdated: string;
}

const DEFAULT_V1_STATE: DemoContentState = {
  version: 1,
  badge: 'STARTER TIER',
  title: 'Apex Cloud Services — Managed Compute & Storage',
  headline: 'Fast, secure cloud compute and PostgreSQL clusters for scaling teams.',
  planName: 'Developer Starter Pack',
  price: '$49',
  billingCycle: '/ month',
  announcement: 'SUMMER SPECIAL: 10% off your first 3 months with code SUMMER24.',
  features: [
    '4 vCPU Dedicated Compute Nodes',
    '16 GB RAM with NVMe SSD Storage',
    'Automated Daily Database Snapshots',
    'Standard Community & Email Support',
    '99.9% Uptime SLA',
  ],
  systemStatus: 'ALL SERVICES OPERATIONAL (US-EAST, EU-CENTRAL)',
  lastUpdated: new Date().toISOString(),
};

const UPDATED_V2_STATE: DemoContentState = {
  version: 2,
  badge: 'ENTERPRISE PRO TIER [UPDATED]',
  title: 'Apex Cloud Services — Enterprise Managed Compute, AI & Vectors',
  headline: 'Ultra low-latency global compute, GPU clusters, and vector databases.',
  planName: 'Enterprise Growth Tier',
  price: '$89',
  billingCycle: '/ month (PRICE REVISED)',
  announcement: 'CRITICAL UPDATE: Real-time Multi-Region Replication and Zero-Trust SSO are now live globally!',
  features: [
    '8 vCPU High-Performance Compute Nodes (UPGRADED)',
    '32 GB RAM with High-IOPS NVMe Storage (UPGRADED)',
    'Continuous Real-Time Multi-Region Database Streaming',
    '24/7 Dedicated Support Engineer via Slack & Phone',
    'SOC2 Type II & HIPAA Compliance Certified',
    '99.99% Uptime High-Availability SLA',
  ],
  systemStatus: 'GLOBAL EDGE NETWORK EXPANDED: 18 NEW LOCATIONS ADDED',
  lastUpdated: new Date().toISOString(),
};

// Current in-memory state
let currentDemoState: DemoContentState = { ...DEFAULT_V1_STATE };

// GET /demo/sample-page - Serves the dynamic target HTML page
demoRouter.get('/sample-page', (_req, res) => {
  const s = currentDemoState;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${s.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background-color: #0b0f19; color: #f8fafc; padding: 40px 20px; line-height: 1.6; }
    .container { max-width: 800px; margin: 0 auto; background: #131b2e; border: 1px solid #1e293b; border-radius: 12px; padding: 36px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .badge { display: inline-block; background: ${s.version === 1 ? '#0284c7' : '#ff4d00'}; color: #fff; font-size: 0.75rem; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; padding: 4px 10px; border-radius: 4px; margin-bottom: 16px; }
    h1 { font-size: 2rem; color: #ffffff; margin-bottom: 12px; letter-spacing: -0.02em; }
    .headline { font-size: 1.1rem; color: #94a3b8; margin-bottom: 24px; }
    .announcement { background: rgba(2, 132, 199, 0.15); border-left: 4px solid ${s.version === 1 ? '#0284c7' : '#ff4d00'}; padding: 14px 18px; margin-bottom: 28px; font-size: 0.95rem; color: #e2e8f0; }
    .pricing-box { background: #0b0f19; border: 1px solid #334155; border-radius: 8px; padding: 24px; margin-bottom: 28px; display: flex; align-items: baseline; justify-content: space-between; }
    .plan-title { font-size: 1rem; color: #94a3b8; font-weight: 500; }
    .price { font-size: 2.75rem; font-weight: 800; color: #38bdf8; }
    .cycle { font-size: 0.85rem; color: #64748b; margin-left: 6px; }
    h2 { font-size: 1.15rem; color: #f1f5f9; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em; }
    ul { list-style: none; margin-bottom: 28px; }
    li { padding: 10px 0; border-bottom: 1px solid #1e293b; font-size: 0.95rem; color: #cbd5e1; display: flex; align-items: center; }
    li::before { content: "✓"; color: #00ff94; font-weight: bold; margin-right: 12px; font-size: 1.1rem; }
    .footer { font-size: 0.8rem; color: #64748b; padding-top: 20px; border-top: 1px solid #1e293b; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">${s.badge} (VERSION ${s.version})</div>
    <h1 id="page-title">${s.title}</h1>
    <p class="headline" id="page-headline">${s.headline}</p>

    <div class="announcement" id="page-announcement">
      <strong>NOTICE:</strong> ${s.announcement}
    </div>

    <div class="pricing-box">
      <div>
        <div class="plan-title" id="plan-name">${s.planName}</div>
        <div style="font-size: 0.8rem; color: #64748b; margin-top: 4px;">Includes all core cloud services</div>
      </div>
      <div>
        <span class="price" id="plan-price">${s.price}</span>
        <span class="cycle">${s.billingCycle}</span>
      </div>
    </div>

    <h2>Included Service Capabilities</h2>
    <ul id="features-list">
      ${s.features.map(f => `<li>${f}</li>`).join('')}
    </ul>

    <div class="footer">
      <span id="system-status">${s.systemStatus}</span>
      <span>Simulated Live Target</span>
    </div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// GET /demo/sample-page/state - Returns current content state JSON
demoRouter.get('/sample-page/state', (_req, res) => {
  res.json({
    success: true,
    data: currentDemoState,
  });
});

// POST /demo/sample-page/change - Modifies the page content (e.g. to Version 2 or custom content)
demoRouter.post('/sample-page/change', (req, res) => {
  const body = req.body || {};

  if (body.custom) {
    currentDemoState = {
      ...currentDemoState,
      ...body.custom,
      version: currentDemoState.version + 1,
      lastUpdated: new Date().toISOString(),
    };
  } else {
    // Advance to V2 (or flip between V1 and V2)
    if (currentDemoState.version === 1) {
      currentDemoState = {
        ...UPDATED_V2_STATE,
        lastUpdated: new Date().toISOString(),
      };
    } else {
      currentDemoState = {
        ...DEFAULT_V1_STATE,
        version: currentDemoState.version + 1,
        title: `Apex Cloud Services — Version ${currentDemoState.version + 1}`,
        price: `$${60 + (currentDemoState.version * 10)}`,
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  res.json({
    success: true,
    message: `Demo page content modified to Version ${currentDemoState.version}.`,
    state: currentDemoState,
  });
});

// POST /demo/sample-page/reset - Resets the page back to initial Version 1
demoRouter.post('/sample-page/reset', (_req, res) => {
  currentDemoState = {
    ...DEFAULT_V1_STATE,
    lastUpdated: new Date().toISOString(),
  };

  res.json({
    success: true,
    message: 'Demo page content reset back to Version 1 (Baseline).',
    state: currentDemoState,
  });
});

// POST /demo/verify-cycle - Runs an end-to-end automated verification cycle
// 1. Registers demo target URL in WebWatch
// 2. Performs Check #1 (captures Baseline V1)
// 3. Mutates demo page content to Version 2
// 4. Performs Check #2 (detects meaningful change)
// 5. Computes diff and returns all evidence
demoRouter.post('/verify-cycle', async (req, res) => {
  try {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    const targetUrl = `${protocol}://${host}/demo/sample-page`;
    const demoPageId = 'demo-test-target-page';

    // 1. Reset demo page to Version 1
    currentDemoState = { ...DEFAULT_V1_STATE, lastUpdated: new Date().toISOString() };

    // 2. Ensure existing demo page record is cleaned up or created
    await db.deletePage(demoPageId);

    const now = new Date().toISOString();
    const demoPage: MonitoredPage = {
      id: demoPageId,
      url: targetUrl,
      name: 'Apex Cloud Services [DEMO TARGET]',
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

    await db.createPage(demoPage);

    // 3. Execute Check #1 (Baseline Snapshot v1)
    const check1 = await scheduler.runPageCheck(demoPageId, true);
    const snap1 = await db.getLatestSnapshot(demoPageId);

    // 4. Mutate content to Version 2
    currentDemoState = { ...UPDATED_V2_STATE, lastUpdated: new Date().toISOString() };

    // 5. Execute Check #2 (Drift Detection)
    const check2 = await scheduler.runPageCheck(demoPageId, true);
    const snap2 = await db.getLatestSnapshot(demoPageId);
    const updatedPage = await db.getPageById(demoPageId);

    // 6. Fetch snapshots and diff
    const snapshots = await db.getSnapshots(demoPageId);

    res.json({
      success: true,
      targetUrl,
      pageId: demoPageId,
      results: {
        step1_baselineCheck: {
          success: check1.success,
          message: check1.message,
          snapshotVersion: snap1?.versionNumber,
          extractedTitle: snap1?.extractedTitle,
          contentHash: snap1?.contentHash,
        },
        step2_contentChange: {
          previousPrice: DEFAULT_V1_STATE.price,
          newPrice: UPDATED_V2_STATE.price,
          previousTitle: DEFAULT_V1_STATE.title,
          newTitle: UPDATED_V2_STATE.title,
        },
        step3_secondCheck: {
          success: check2.success,
          message: check2.message,
          snapshotVersion: snap2?.versionNumber,
          status: updatedPage?.status,
          totalChanges: updatedPage?.totalChanges,
          changeSummary: snap2?.changeSummary,
        },
        snapshotsCount: snapshots.length,
        verified: updatedPage?.status === 'CHANGED' && snap2?.versionNumber === 2,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});
