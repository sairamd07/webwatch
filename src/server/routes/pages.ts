import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../db/index.js';
import { scheduler } from '../scheduler/queue.js';
import { validateUrlAgainstSSRF } from '../monitoring/ssrf.js';
import { MonitoredPage } from '../../types/index.js';

export const pagesRouter = Router();

// Validation schema for creating/updating a monitored page
const pageInputSchema = z.object({
  url: z.string().url('Invalid URL format').trim(),
  name: z.string().min(1, 'Name is required').max(100).trim(),
  checkIntervalMinutes: z.number().int().min(15).max(1440).default(60),
  sensitivity: z.enum(['low', 'medium', 'high']).default('medium'),
  watchedSelectors: z.array(z.string()).default([]),
  ignoredSelectors: z.array(z.string()).default([]),
  notifyEmail: z.string().email().optional().or(z.literal('')),
  notifyTelegramChatId: z.string().optional().or(z.literal('')),
  notifyDiscordWebhook: z.string().url().optional().or(z.literal('')),
  quietHoursStart: z.string().optional().or(z.literal('')),
  quietHoursEnd: z.string().optional().or(z.literal('')),
  dailyDigestOnly: z.boolean().default(false),
});

// GET /api/pages - List all monitored pages
pagesRouter.get('/', async (_req, res) => {
  try {
    const pages = await db.getPages();
    res.json({ success: true, data: pages });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/pages/export - Export monitoring configurations as JSON
pagesRouter.get('/export', async (_req, res) => {
  try {
    const pages = await db.getPages();
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      generator: 'WebWatch — Website Change Detector',
      pagesCount: pages.length,
      pages: pages.map(p => ({
        url: p.url,
        name: p.name,
        checkIntervalMinutes: p.checkIntervalMinutes,
        sensitivity: p.sensitivity,
        watchedSelectors: p.watchedSelectors,
        ignoredSelectors: p.ignoredSelectors,
        notifyEmail: p.notifyEmail,
        notifyTelegramChatId: p.notifyTelegramChatId,
        notifyDiscordWebhook: p.notifyDiscordWebhook,
        quietHoursStart: p.quietHoursStart,
        quietHoursEnd: p.quietHoursEnd,
        dailyDigestOnly: p.dailyDigestOnly,
      })),
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="webwatch-configurations.json"');
    res.json(exportData);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/pages/import - Import monitoring configurations from JSON
pagesRouter.post('/import', async (req, res) => {
  try {
    const body = req.body;
    let pagesToImport: any[] = [];

    if (Array.isArray(body)) {
      pagesToImport = body;
    } else if (body && Array.isArray(body.pages)) {
      pagesToImport = body.pages;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid format: expected a JSON array or an object with a "pages" array.',
      });
    }

    if (pagesToImport.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No pages found in import data.',
      });
    }

    const existingPages = await db.getPages();
    const existingByUrl = new Map(existingPages.map(p => [p.url.toLowerCase(), p]));

    let importedCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < pagesToImport.length; i++) {
      const item = pagesToImport[i];
      try {
        const validated = pageInputSchema.parse(item);

        // SSRF Check
        const ssrfResult = await validateUrlAgainstSSRF(validated.url);
        if (!ssrfResult.valid) {
          errors.push(`Page #${i + 1} (${validated.url}): SSRF validation failed - ${ssrfResult.error}`);
          continue;
        }

        const normalizedUrl = validated.url.toLowerCase();
        const existing = existingByUrl.get(normalizedUrl);

        if (existing) {
          // Update existing configuration
          await db.updatePage(existing.id, {
            name: validated.name,
            checkIntervalMinutes: validated.checkIntervalMinutes,
            sensitivity: validated.sensitivity,
            watchedSelectors: validated.watchedSelectors.filter(s => s.trim().length > 0),
            ignoredSelectors: validated.ignoredSelectors.filter(s => s.trim().length > 0),
            notifyEmail: validated.notifyEmail || undefined,
            notifyTelegramChatId: validated.notifyTelegramChatId || undefined,
            notifyDiscordWebhook: validated.notifyDiscordWebhook || undefined,
            quietHoursStart: validated.quietHoursStart || undefined,
            quietHoursEnd: validated.quietHoursEnd || undefined,
            dailyDigestOnly: validated.dailyDigestOnly,
          });
          updatedCount++;
        } else {
          // Create new page
          const now = new Date().toISOString();
          const newPage: MonitoredPage = {
            id: crypto.randomUUID(),
            url: validated.url,
            name: validated.name,
            checkIntervalMinutes: validated.checkIntervalMinutes,
            sensitivity: validated.sensitivity,
            status: 'OK',
            watchedSelectors: validated.watchedSelectors.filter(s => s.trim().length > 0),
            ignoredSelectors: validated.ignoredSelectors.filter(s => s.trim().length > 0),
            totalChecks: 0,
            totalChanges: 0,
            isPaused: false,
            notifyEmail: validated.notifyEmail || undefined,
            notifyTelegramChatId: validated.notifyTelegramChatId || undefined,
            notifyDiscordWebhook: validated.notifyDiscordWebhook || undefined,
            quietHoursStart: validated.quietHoursStart || undefined,
            quietHoursEnd: validated.quietHoursEnd || undefined,
            dailyDigestOnly: validated.dailyDigestOnly,
            createdAt: now,
            updatedAt: now,
            nextCheckAt: now,
          };

          await db.createPage(newPage);
          existingByUrl.set(normalizedUrl, newPage);

          // Trigger baseline snapshot fetch asynchronously
          scheduler.runPageCheck(newPage.id, true).catch(err => {
            console.error(`[Import] Baseline fetch error for ${newPage.id}:`, err);
          });

          importedCount++;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Page #${i + 1} (${item?.url || 'unknown'}): ${msg}`);
      }
    }

    res.json({
      success: true,
      importedCount,
      updatedCount,
      errors,
      message: `Import complete: ${importedCount} created, ${updatedCount} updated${errors.length > 0 ? `, ${errors.length} failed` : ''}.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/pages/:id - Get page details
pagesRouter.get('/:id', async (req, res) => {
  try {
    const page = await db.getPageById(req.params.id);
    if (!page) {
      return res.status(404).json({ success: false, error: 'Page not found' });
    }
    const snapshots = await db.getSnapshots(page.id);
    res.json({ success: true, data: { ...page, snapshots } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/pages - Register a new monitored page
pagesRouter.post('/', async (req, res) => {
  try {
    const validated = pageInputSchema.parse(req.body);

    // SSRF Check
    const ssrfResult = await validateUrlAgainstSSRF(validated.url);
    if (!ssrfResult.valid) {
      return res.status(400).json({
        success: false,
        error: `Security Validation Failed: ${ssrfResult.error}`,
      });
    }

    const now = new Date().toISOString();
    const newPage: MonitoredPage = {
      id: crypto.randomUUID(),
      url: validated.url,
      name: validated.name,
      checkIntervalMinutes: validated.checkIntervalMinutes,
      sensitivity: validated.sensitivity,
      status: 'OK',
      watchedSelectors: validated.watchedSelectors.filter(s => s.trim().length > 0),
      ignoredSelectors: validated.ignoredSelectors.filter(s => s.trim().length > 0),
      totalChecks: 0,
      totalChanges: 0,
      isPaused: false,
      notifyEmail: validated.notifyEmail || undefined,
      notifyTelegramChatId: validated.notifyTelegramChatId || undefined,
      notifyDiscordWebhook: validated.notifyDiscordWebhook || undefined,
      quietHoursStart: validated.quietHoursStart || undefined,
      quietHoursEnd: validated.quietHoursEnd || undefined,
      dailyDigestOnly: validated.dailyDigestOnly,
      createdAt: now,
      updatedAt: now,
      nextCheckAt: now, // Check immediately
    };

    await db.createPage(newPage);

    // Trigger initial baseline check asynchronously
    scheduler.runPageCheck(newPage.id, true).catch(err => {
      console.error(`[Pages] Initial baseline fetch error for ${newPage.id}:`, err);
    });

    res.status(201).json({
      success: true,
      message: 'Page registered successfully. Baseline snapshot fetch initiated.',
      data: newPage,
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// PUT /api/pages/:id - Update page configuration
pagesRouter.put('/:id', async (req, res) => {
  try {
    const existing = await db.getPageById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Page not found' });
    }

    const validated = pageInputSchema.parse(req.body);

    // SSRF Check if URL changed
    if (validated.url !== existing.url) {
      const ssrfResult = await validateUrlAgainstSSRF(validated.url);
      if (!ssrfResult.valid) {
        return res.status(400).json({
          success: false,
          error: `Security Validation Failed: ${ssrfResult.error}`,
        });
      }
    }

    const updated = await db.updatePage(req.params.id, {
      url: validated.url,
      name: validated.name,
      checkIntervalMinutes: validated.checkIntervalMinutes,
      sensitivity: validated.sensitivity,
      watchedSelectors: validated.watchedSelectors.filter(s => s.trim().length > 0),
      ignoredSelectors: validated.ignoredSelectors.filter(s => s.trim().length > 0),
      notifyEmail: validated.notifyEmail || undefined,
      notifyTelegramChatId: validated.notifyTelegramChatId || undefined,
      notifyDiscordWebhook: validated.notifyDiscordWebhook || undefined,
      quietHoursStart: validated.quietHoursStart || undefined,
      quietHoursEnd: validated.quietHoursEnd || undefined,
      dailyDigestOnly: validated.dailyDigestOnly,
    });

    res.json({ success: true, data: updated });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// DELETE /api/pages/:id - Delete page
pagesRouter.delete('/:id', async (req, res) => {
  try {
    const success = await db.deletePage(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Page not found' });
    }
    res.json({ success: true, message: 'Page deleted successfully' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/pages/:id/check - Trigger immediate manual check
pagesRouter.post('/:id/check', async (req, res) => {
  try {
    const page = await db.getPageById(req.params.id);
    if (!page) {
      return res.status(404).json({ success: false, error: 'Page not found' });
    }

    const checkResult = await scheduler.runPageCheck(page.id, true);
    const updatedPage = await db.getPageById(page.id);

    res.json({
      success: checkResult.success,
      message: checkResult.message,
      data: updatedPage,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/pages/:id/toggle-pause - Toggle pause/resume
pagesRouter.post('/:id/toggle-pause', async (req, res) => {
  try {
    const page = await db.getPageById(req.params.id);
    if (!page) {
      return res.status(404).json({ success: false, error: 'Page not found' });
    }

    const isPaused = !page.isPaused;
    const status = isPaused ? 'PAUSED' : 'OK';

    const updated = await db.updatePage(page.id, {
      isPaused,
      status: isPaused ? status : (page.lastError ? 'ERROR' : 'OK'),
    });

    res.json({
      success: true,
      data: updated,
      message: isPaused ? 'Monitoring paused' : 'Monitoring resumed',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});
