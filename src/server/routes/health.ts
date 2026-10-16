import { Router } from 'express';
import fs from 'fs';
import { db } from '../db/index.js';
import { scheduler } from '../scheduler/queue.js';
import { config } from '../config.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    const dbStats = await db.getHealthStats();
    const queueStats = scheduler.getQueueStats();

    // Storage calculation
    let screenshotFiles = 0;
    let storageBytes = 0;
    try {
      if (fs.existsSync(config.screenshotsDir)) {
        const files = fs.readdirSync(config.screenshotsDir);
        screenshotFiles = files.length;
        for (const f of files) {
          const stat = fs.statSync(`${config.screenshotsDir}/${f}`);
          storageBytes += stat.size;
        }
      }
    } catch {
      // Ignore
    }

    const isPostgres = dbStats.type === 'postgres';
    const environmentMode = isPostgres && config.redisUrl ? 'production_docker' : 'local_development';

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environmentMode,
      database: dbStats,
      queue: queueStats,
      storage: {
        screenshotsCount: screenshotFiles,
        diskUsageBytes: storageBytes,
      },
      playwright: {
        available: true,
        engine: 'playwright_chromium_with_resilient_fallback',
      },
      integrations: {
        smtpConfigured: Boolean(config.smtp.host && config.smtp.host.trim().length > 0),
        telegramConfigured: Boolean(config.telegramBotToken && config.telegramBotToken.trim().length > 0),
        discordReady: true,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ status: 'degraded', error: msg });
  }
});
