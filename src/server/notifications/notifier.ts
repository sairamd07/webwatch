import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { MonitoredPage, AlertChannel, AlertNotification } from '../../types/index.js';

/**
 * Checks if current time is within user's configured quiet hours.
 * Formats: "HH:MM", 24-hour clock.
 */
export function isCurrentlyQuietHours(start?: string, end?: string): boolean {
  if (!start || !end) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);

  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return false;

  const startTotal = startH * 60 + startM;
  const endTotal = endH * 60 + endM;

  if (startTotal <= endTotal) {
    return currentMinutes >= startTotal && currentMinutes < endTotal;
  } else {
    return currentMinutes >= startTotal || currentMinutes < endTotal;
  }
}

/**
 * Sends a real Discord webhook notification.
 */
async function sendDiscordWebhook(webhookUrl: string, payload: {
  pageName: string;
  pageUrl: string;
  changeSummary: string;
  versionNumber: number;
  comparisonUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const fields: Array<{ name: string; value: string; inline: boolean }> = [
      { name: 'Monitored URL', value: payload.pageUrl, inline: false },
      { name: 'Snapshot Version', value: `v${payload.versionNumber}`, inline: true },
      { name: 'Timestamp', value: new Date().toUTCString(), inline: true },
    ];

    if (payload.comparisonUrl) {
      fields.push({
        name: 'Inspect Differences',
        value: `[View Version Comparison](${payload.comparisonUrl})`,
        inline: false,
      });
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'WebWatch Alerts',
        avatar_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=128&q=80',
        embeds: [
          {
            title: `🔔 Meaningful Change Detected: ${payload.pageName}`,
            url: payload.pageUrl,
            color: 0x3b82f6,
            description: payload.changeSummary,
            fields,
            footer: { text: 'WebWatch Website Change Detector' },
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `Discord HTTP ${res.status}: ${body}` };
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Sends a real Telegram message via Telegram Bot API.
 */
async function sendTelegramMessage(chatId: string, message: string): Promise<{ success: boolean; error?: string }> {
  if (!config.telegramBotToken) {
    return {
      success: false,
      error: 'Telegram Bot Token is not configured. Set TELEGRAM_BOT_TOKEN in .env to dispatch Telegram alerts.',
    };
  }

  try {
    const url = `https://api.telegram.org/bot${encodeURIComponent(config.telegramBotToken)}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `Telegram HTTP ${res.status}: ${body}` };
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Sends an email via configured SMTP. Returns a friendly message if unconfigured.
 */
async function sendEmailNotification(to: string, subject: string, htmlContent: string): Promise<{ success: boolean; error?: string }> {
  if (!config.smtp.host) {
    return {
      success: false,
      error: 'SMTP email is optional and currently unconfigured. Set SMTP_HOST in .env to enable email alerts.',
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? {
        user: config.smtp.user,
        pass: config.smtp.pass,
      } : undefined,
    });

    await transporter.sendMail({
      from: config.smtp.from,
      to,
      subject,
      html: htmlContent,
    });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Dispatches alerts across all configured channels for a meaningful change
 * with persistent idempotency and quiet-hours enforcement.
 */
export async function dispatchChangeAlerts(
  page: MonitoredPage,
  versionNumber: number,
  changeSummary: string
): Promise<AlertNotification[]> {
  const notifications: AlertNotification[] = [];
  const isQuiet = isCurrentlyQuietHours(page.quietHoursStart, page.quietHoursEnd);
  const appUrl = config.appUrl || 'http://localhost:3000';
  const comparisonUrl = `${appUrl}/?pageId=${encodeURIComponent(page.id)}&compare=true`;

  // 1. Discord Webhook Channel
  if (page.notifyDiscordWebhook) {
    const channel: AlertChannel = 'discord';
    const idempotencyKey = `${page.id}:${versionNumber}:${channel}`;
    const alreadySent = await db.isIdempotencyKeyUsed(idempotencyKey);

    if (!alreadySent) {
      let status: AlertNotification['status'] = 'SENT';
      let error: string | undefined;

      if (page.dailyDigestOnly) {
        status = 'QUEUED_FOR_DIGEST';
      } else if (isQuiet) {
        status = 'SUPPRESSED_QUIET_HOURS';
      } else {
        const sendRes = await sendDiscordWebhook(page.notifyDiscordWebhook, {
          pageName: page.name,
          pageUrl: page.url,
          changeSummary,
          versionNumber,
          comparisonUrl,
        });
        if (!sendRes.success) {
          status = 'FAILED';
          error = sendRes.error;
        }
      }

      const alert: AlertNotification = {
        id: crypto.randomUUID(),
        pageId: page.id,
        pageName: page.name,
        pageUrl: page.url,
        versionNumber,
        channel,
        destination: page.notifyDiscordWebhook.replace(/\/[^/]+$/, '/***'),
        status,
        message: page.dailyDigestOnly ? `[Queued for Daily Digest] ${changeSummary}` : changeSummary,
        error,
        sentAt: new Date().toISOString(),
        idempotencyKey,
      };

      await db.createAlert(alert);
      notifications.push(alert);
    }
  }

  // 2. Telegram Channel
  if (page.notifyTelegramChatId) {
    const channel: AlertChannel = 'telegram';
    const idempotencyKey = `${page.id}:${versionNumber}:${channel}`;
    const alreadySent = await db.isIdempotencyKeyUsed(idempotencyKey);

    if (!alreadySent) {
      let status: AlertNotification['status'] = 'SENT';
      let error: string | undefined;

      if (page.dailyDigestOnly) {
        status = 'QUEUED_FOR_DIGEST';
      } else if (!config.telegramBotToken) {
        status = 'SKIPPED_UNCONFIGURED';
        error = 'Telegram Bot Token not configured in server environment (optional channel).';
      } else if (isQuiet) {
        status = 'SUPPRESSED_QUIET_HOURS';
      } else {
        const text = `🔔 <b>WebWatch Alert: ${page.name}</b>\n\n` +
          `A meaningful change was detected on <a href="${page.url}">${page.url}</a> (v${versionNumber}).\n\n` +
          `<b>Summary:</b>\n${changeSummary}\n\n` +
          `<b>Compare Diffs:</b> <a href="${comparisonUrl}">View Version Diff</a>\n\n` +
          `<i>Checked at ${new Date().toUTCString()}</i>`;

        const sendRes = await sendTelegramMessage(page.notifyTelegramChatId, text);
        if (!sendRes.success) {
          status = 'FAILED';
          error = sendRes.error;
        }
      }

      const alert: AlertNotification = {
        id: crypto.randomUUID(),
        pageId: page.id,
        pageName: page.name,
        pageUrl: page.url,
        versionNumber,
        channel,
        destination: `Telegram Chat ID: ${page.notifyTelegramChatId}`,
        status,
        message: page.dailyDigestOnly ? `[Queued for Daily Digest] ${changeSummary}` : changeSummary,
        error,
        sentAt: new Date().toISOString(),
        idempotencyKey,
      };

      await db.createAlert(alert);
      notifications.push(alert);
    }
  }

  // 3. Email Channel (Optional SMTP)
  if (page.notifyEmail) {
    const channel: AlertChannel = 'email';
    const idempotencyKey = `${page.id}:${versionNumber}:${channel}`;
    const alreadySent = await db.isIdempotencyKeyUsed(idempotencyKey);

    if (!alreadySent) {
      let status: AlertNotification['status'] = 'SENT';
      let error: string | undefined;

      if (page.dailyDigestOnly) {
        status = 'QUEUED_FOR_DIGEST';
      } else if (!config.smtp.host) {
        status = 'SKIPPED_UNCONFIGURED';
        error = 'SMTP server not configured in environment. Email alerts are optional and skipped safely.';
      } else if (isQuiet) {
        status = 'SUPPRESSED_QUIET_HOURS';
      } else {
        const subject = `[WebWatch] Meaningful Change Detected: ${page.name}`;
        const html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #0f172a; margin-top: 0;">WebWatch Alert</h2>
            <p style="color: #475569; font-size: 16px;">A meaningful change has been verified for <strong>${page.name}</strong>.</p>
            <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; font-weight: 600; color: #1e293b;">Change Details (v${versionNumber}):</p>
              <p style="margin: 8px 0 0 0; color: #334155;">${changeSummary}</p>
            </div>
            <p style="margin: 20px 0;">
              <a href="${comparisonUrl}" style="background-color: #0f172a; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600; display: inline-block;">
                Inspect Version Differences
              </a>
            </p>
            <p style="color: #64748b; font-size: 14px;"><strong>Target Page:</strong> <a href="${page.url}" style="color: #2563eb;">${page.url}</a></p>
            <p style="color: #64748b; font-size: 14px;"><strong>Timestamp:</strong> ${new Date().toUTCString()}</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">Sent by WebWatch — Website Change Detector.</p>
          </div>
        `;

        const sendRes = await sendEmailNotification(page.notifyEmail, subject, html);
        if (!sendRes.success) {
          status = 'FAILED';
          error = sendRes.error;
        }
      }

      const alert: AlertNotification = {
        id: crypto.randomUUID(),
        pageId: page.id,
        pageName: page.name,
        pageUrl: page.url,
        versionNumber,
        channel,
        destination: page.notifyEmail,
        status,
        message: page.dailyDigestOnly ? `[Queued for Daily Digest] ${changeSummary}` : changeSummary,
        error,
        sentAt: new Date().toISOString(),
        idempotencyKey,
      };

      await db.createAlert(alert);
      notifications.push(alert);
    }
  }

  // Update recent alert status on the page
  if (notifications.length > 0) {
    const primaryStatus = notifications[0].status;
    await db.updatePage(page.id, {
      recentAlertStatus: primaryStatus,
    });
  }

  return notifications;
}

/**
 * Compiles and sends the Daily Digest of all changes detected in the last 24 hours
 * to configured channels for pages requesting daily digests.
 */
export async function sendDailyDigest(): Promise<{
  success: boolean;
  changesCount: number;
  sentCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let sentCount = 0;

  try {
    const pages = await db.getPages();
    const digestPages = pages.filter(p => p.dailyDigestOnly || p.notifyEmail || p.notifyDiscordWebhook || p.notifyTelegramChatId);
    if (digestPages.length === 0) {
      return { success: true, changesCount: 0, sentCount: 0, errors: [] };
    }

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const allAlerts = await db.getAlerts(200);
    const recentChanges = allAlerts.filter(a => a.sentAt >= yesterday && (a.status === 'SENT' || a.status === 'QUEUED_FOR_DIGEST'));

    if (recentChanges.length === 0) {
      return { success: true, changesCount: 0, sentCount: 0, errors: [] };
    }

    const appUrl = config.appUrl || 'http://localhost:3000';

    // Group changes by page
    const pageChangesMap = new Map<string, typeof recentChanges>();
    for (const alert of recentChanges) {
      const list = pageChangesMap.get(alert.pageId) || [];
      list.push(alert);
      pageChangesMap.set(alert.pageId, list);
    }

    // Dispatch to each page's configured channels
    for (const page of digestPages) {
      const changesForPage = pageChangesMap.get(page.id);
      if (!changesForPage || changesForPage.length === 0) continue;

      // Email Digest
      if (page.notifyEmail && config.smtp.host) {
        const subject = `[WebWatch Daily Digest] Changes detected for ${page.name}`;
        const html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #0f172a; margin-top: 0;">WebWatch Daily Digest</h2>
            <p style="color: #475569; font-size: 15px;">Summary of changes detected in the past 24 hours for <strong>${page.name}</strong>.</p>
            <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0;">
              <ul style="margin: 0; padding-left: 18px; color: #334155;">
                ${changesForPage.map(a => `<li style="margin-bottom: 8px;"><strong>v${a.versionNumber}:</strong> ${a.message}</li>`).join('')}
              </ul>
            </div>
            <p><a href="${appUrl}/?pageId=${page.id}&compare=true" style="background-color: #0f172a; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600; display: inline-block;">View Side-by-Side Comparison</a></p>
            <p style="color: #64748b; font-size: 13px;">Target URL: <a href="${page.url}">${page.url}</a></p>
          </div>
        `;
        const emailRes = await sendEmailNotification(page.notifyEmail, subject, html);
        if (emailRes.success) sentCount++;
        else errors.push(`Email digest failed for ${page.name}: ${emailRes.error}`);
      }

      // Discord Digest
      if (page.notifyDiscordWebhook) {
        const discordRes = await sendDiscordWebhook(page.notifyDiscordWebhook, {
          pageName: `Daily Digest: ${page.name}`,
          pageUrl: page.url,
          changeSummary: `${changesForPage.length} meaningful update(s) detected in the last 24 hours.`,
          versionNumber: changesForPage[0].versionNumber,
          comparisonUrl: `${appUrl}/?pageId=${page.id}&compare=true`,
        });
        if (discordRes.success) sentCount++;
        else errors.push(`Discord digest failed for ${page.name}: ${discordRes.error}`);
      }

      // Telegram Digest
      if (page.notifyTelegramChatId && config.telegramBotToken) {
        const msg = `📰 <b>WebWatch Daily Digest: ${page.name}</b>\n\n` +
          `${changesForPage.length} meaningful update(s) detected in the last 24h.\n\n` +
          `<b>Recent details:</b>\n${changesForPage.map(a => `• v${a.versionNumber}: ${a.message}`).join('\n')}\n\n` +
          `<a href="${appUrl}/?pageId=${page.id}&compare=true">Inspect Version Diff</a>`;
        const tgRes = await sendTelegramMessage(page.notifyTelegramChatId, msg);
        if (tgRes.success) sentCount++;
        else errors.push(`Telegram digest failed for ${page.name}: ${tgRes.error}`);
      }
    }

    return {
      success: errors.length === 0,
      changesCount: recentChanges.length,
      sentCount,
      errors,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    return { success: false, changesCount: 0, sentCount, errors };
  }
}

/**
 * Sends a real test notification to verify integration channels safely.
 */
export async function testChannelNotification(
  channel: AlertChannel,
  destination: string
): Promise<{ success: boolean; message: string }> {
  const appUrl = config.appUrl || 'http://localhost:3000';
  const comparisonUrl = `${appUrl}/?compare=true`;

  if (channel === 'discord') {
    const res = await sendDiscordWebhook(destination, {
      pageName: 'Test WebWatch Alert',
      pageUrl: 'https://example.com',
      changeSummary: 'This is a test notification confirming your Discord webhook configuration works correctly.',
      versionNumber: 1,
      comparisonUrl,
    });
    return {
      success: res.success,
      message: res.success ? 'Discord test message dispatched successfully!' : `Discord test failed: ${res.error}`,
    };
  }

  if (channel === 'telegram') {
    if (!config.telegramBotToken) {
      return {
        success: false,
        message: 'Telegram Bot Token is not configured. Set TELEGRAM_BOT_TOKEN in .env to enable Telegram messages.',
      };
    }
    const res = await sendTelegramMessage(
      destination,
      `🔔 <b>WebWatch Test Alert</b>\n\nYour Telegram notification configuration is working properly!\n\n<a href="${comparisonUrl}">Test Comparison Link</a>`
    );
    return {
      success: res.success,
      message: res.success ? 'Telegram test message dispatched successfully!' : `Telegram test failed: ${res.error}`,
    };
  }

  if (channel === 'email') {
    if (!config.smtp.host) {
      return {
        success: false,
        message: 'SMTP email is optional and currently unconfigured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in your .env file to enable email delivery.',
      };
    }

    const res = await sendEmailNotification(
      destination,
      '[WebWatch] Verification Test Notification',
      `<p>This test email confirms your WebWatch SMTP notification setup is operational.</p><p><a href="${comparisonUrl}">Test Comparison Link</a></p>`
    );
    return {
      success: res.success,
      message: res.success ? 'Test email dispatched successfully!' : `Email dispatch failed: ${res.error}`,
    };
  }

  return { success: false, message: 'Unsupported channel' };
}
