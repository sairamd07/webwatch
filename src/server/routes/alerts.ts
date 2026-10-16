import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { testChannelNotification, sendDailyDigest } from '../notifications/notifier.js';
import { AlertChannel } from '../../types/index.js';

export const alertsRouter = Router();

// GET /api/alerts - List recent alerts
alertsRouter.get('/', async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(String(req.query.limit || '50'), 10));
    const alerts = await db.getAlerts(limit);
    res.json({ success: true, data: alerts });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/alerts/test - Test a notification channel destination
alertsRouter.post('/test', async (req, res) => {
  try {
    const schema = z.object({
      channel: z.enum(['email', 'telegram', 'discord']),
      destination: z.string().min(1, 'Destination is required'),
    });

    const { channel, destination } = schema.parse(req.body);
    const result = await testChannelNotification(channel as AlertChannel, destination);

    res.json({
      success: result.success,
      message: result.message,
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: err.message });
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/alerts/digest - Manually dispatch daily digest
alertsRouter.post('/digest', async (_req, res) => {
  try {
    const result = await sendDailyDigest();
    res.json({
      success: result.success,
      data: result,
      message: `Daily digest dispatched: ${result.sentCount} notification(s) sent across ${result.changesCount} recent change(s).`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// DELETE /api/alerts - Clear all alert logs
alertsRouter.delete('/', async (_req, res) => {
  try {
    await db.clearAlerts();
    res.json({ success: true, message: 'All alert logs cleared successfully.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});
