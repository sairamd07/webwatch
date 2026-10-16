import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { DatabaseSync } from 'node:sqlite';
import { MonitoredPage, PageSnapshot, AlertNotification } from '../../types/index.js';
import type { FetchResult } from '../monitoring/fetcher.js';
import { config } from '../config.js';

const SQLITE_DB_PATH = path.join(config.storageDir, 'webwatch.db');

class DatabaseStore {
  private pgPool: pg.Pool | null = null;
  private sqliteDb: DatabaseSync | null = null;
  public engineType: 'postgres' | 'sqlite_local' = 'sqlite_local';

  constructor() {
    this.init();
  }

  private async init() {
    // 1. If DATABASE_URL is explicitly set (e.g., Docker / Production), connect to PostgreSQL
    if (config.databaseUrl && config.databaseUrl.trim().length > 0) {
      try {
        console.log('[DB] DATABASE_URL provided. Attempting connection to PostgreSQL...');
        this.pgPool = new pg.Pool({
          connectionString: config.databaseUrl,
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });

        // Test connection
        const client = await this.pgPool.connect();
        await client.query('SELECT 1');
        client.release();
        this.engineType = 'postgres';
        console.log('[DB] Successfully connected to PostgreSQL database in production mode.');
        await this.runPgMigrations();
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[DB] PostgreSQL connection failed (${msg}). Switching to local persistent SQLite mode.`);
        this.pgPool = null;
      }
    }

    // 2. Default Local Development Mode: Persistent SQLite
    this.initSQLite();
  }

  private initSQLite() {
    try {
      this.sqliteDb = new DatabaseSync(SQLITE_DB_PATH);
      this.engineType = 'sqlite_local';
      console.log(`[DB] Local Development Mode active: using persistent SQLite at ${SQLITE_DB_PATH}`);

      // Run SQLite Schema Migrations
      this.sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS monitored_pages (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          name TEXT NOT NULL,
          check_interval_minutes INTEGER NOT NULL DEFAULT 60,
          sensitivity TEXT NOT NULL DEFAULT 'medium',
          status TEXT NOT NULL DEFAULT 'OK',
          watched_selectors TEXT DEFAULT '[]',
          ignored_selectors TEXT DEFAULT '[]',
          last_checked_at TEXT,
          last_attempted_check_at TEXT,
          last_successful_check_at TEXT,
          last_changed_at TEXT,
          next_check_at TEXT,
          last_error TEXT,
          current_hash TEXT,
          consecutive_failures INTEGER DEFAULT 0,
          total_checks INTEGER DEFAULT 0,
          total_changes INTEGER DEFAULT 0,
          is_paused INTEGER DEFAULT 0,
          notify_email TEXT,
          notify_telegram_chat_id TEXT,
          notify_discord_webhook TEXT,
          quiet_hours_start TEXT,
          quiet_hours_end TEXT,
          daily_digest_only INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS page_snapshots (
          id TEXT PRIMARY KEY,
          page_id TEXT NOT NULL,
          version_number INTEGER NOT NULL,
          content_hash TEXT NOT NULL,
          normalized_text TEXT NOT NULL,
          raw_text_preview TEXT,
          screenshot_url TEXT,
          screenshot_path TEXT,
          checked_at TEXT NOT NULL,
          is_meaningful_change INTEGER DEFAULT 0,
          change_summary TEXT,
          http_status INTEGER NOT NULL,
          response_time_ms INTEGER NOT NULL DEFAULT 0,
          extracted_title TEXT,
          FOREIGN KEY(page_id) REFERENCES monitored_pages(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS alert_notifications (
          id TEXT PRIMARY KEY,
          page_id TEXT NOT NULL,
          page_name TEXT NOT NULL,
          page_url TEXT NOT NULL,
          version_number INTEGER NOT NULL,
          channel TEXT NOT NULL,
          destination TEXT NOT NULL,
          status TEXT NOT NULL,
          message TEXT NOT NULL,
          error TEXT,
          sent_at TEXT NOT NULL,
          idempotency_key TEXT UNIQUE NOT NULL,
          FOREIGN KEY(page_id) REFERENCES monitored_pages(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_monitored_pages_status ON monitored_pages(status);
        CREATE INDEX IF NOT EXISTS idx_monitored_pages_next_check ON monitored_pages(next_check_at);
        CREATE INDEX IF NOT EXISTS idx_page_snapshots_page_id ON page_snapshots(page_id);
        CREATE INDEX IF NOT EXISTS idx_alert_notifications_idempotency ON alert_notifications(idempotency_key);

        CREATE TABLE IF NOT EXISTS shared_url_fetches (
          url TEXT PRIMARY KEY,
          html TEXT NOT NULL,
          screenshot_path TEXT,
          screenshot_url TEXT,
          http_status INTEGER NOT NULL,
          response_time_ms INTEGER NOT NULL DEFAULT 0,
          fetched_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_shared_url_fetches_expires ON shared_url_fetches(expires_at);
      `);

      // Migration for existing tables
      try { this.sqliteDb.exec('ALTER TABLE monitored_pages ADD COLUMN last_attempted_check_at TEXT;'); } catch {}
      try { this.sqliteDb.exec('ALTER TABLE monitored_pages ADD COLUMN last_successful_check_at TEXT;'); } catch {}
      try { this.sqliteDb.exec('ALTER TABLE monitored_pages ADD COLUMN consecutive_failures INTEGER DEFAULT 0;'); } catch {}
      try { this.sqliteDb.exec('ALTER TABLE monitored_pages ADD COLUMN selector_warning TEXT;'); } catch {}
      try { this.sqliteDb.exec('ALTER TABLE monitored_pages ADD COLUMN recent_alert_status TEXT;'); } catch {}
    } catch (err: unknown) {
      console.error('[DB] Failed to initialize SQLite database:', err);
      throw err;
    }
  }

  private async runPgMigrations() {
    if (!this.pgPool) return;
    try {
      const schemaSqlPath = path.resolve(process.cwd(), 'src', 'server', 'db', 'schema.sql');
      if (fs.existsSync(schemaSqlPath)) {
        const sql = fs.readFileSync(schemaSqlPath, 'utf8');
        await this.pgPool.query(sql);
        console.log('[DB] PostgreSQL schema verified/migrated.');
      }
    } catch (e) {
      console.error('[DB] PostgreSQL migration error:', e);
    }
  }

  // --- Monitored Pages Methods ---

  async getPages(): Promise<MonitoredPage[]> {
    if (this.engineType === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(`
        SELECT 
          id, url, name, check_interval_minutes as "checkIntervalMinutes",
          sensitivity, status, watched_selectors as "watchedSelectors",
          ignored_selectors as "ignoredSelectors", last_checked_at as "lastCheckedAt",
          last_attempted_check_at as "lastAttemptedCheckAt",
          last_successful_check_at as "lastSuccessfulCheckAt",
          last_changed_at as "lastChangedAt", next_check_at as "nextCheckAt",
          last_error as "lastError", current_hash as "currentHash",
          consecutive_failures as "consecutiveFailures",
          total_checks as "totalChecks", total_changes as "totalChanges",
          is_paused as "isPaused", notify_email as "notifyEmail",
          notify_telegram_chat_id as "notifyTelegramChatId",
          notify_discord_webhook as "notifyDiscordWebhook",
          quiet_hours_start as "quietHoursStart", quiet_hours_end as "quietHoursEnd",
          daily_digest_only as "dailyDigestOnly",
          selector_warning as "selectorWarning",
          recent_alert_status as "recentAlertStatus",
          created_at as "createdAt", updated_at as "updatedAt"
        FROM monitored_pages
        ORDER BY created_at DESC
      `);
      return res.rows;
    }

    if (this.sqliteDb) {
      const rows = this.sqliteDb.prepare(`
        SELECT * FROM monitored_pages ORDER BY created_at DESC
      `).all() as any[];

      return rows.map(r => ({
        id: r.id,
        url: r.url,
        name: r.name,
        checkIntervalMinutes: r.check_interval_minutes,
        sensitivity: r.sensitivity,
        status: r.status,
        watchedSelectors: JSON.parse(r.watched_selectors || '[]'),
        ignoredSelectors: JSON.parse(r.ignored_selectors || '[]'),
        lastCheckedAt: r.last_checked_at,
        lastAttemptedCheckAt: r.last_attempted_check_at || r.last_checked_at || null,
        lastSuccessfulCheckAt: r.last_successful_check_at || null,
        lastChangedAt: r.last_changed_at,
        nextCheckAt: r.next_check_at,
        lastError: r.last_error,
        currentHash: r.current_hash,
        consecutiveFailures: r.consecutive_failures || 0,
        totalChecks: r.total_checks,
        totalChanges: r.total_changes,
        isPaused: Boolean(r.is_paused),
        notifyEmail: r.notify_email || undefined,
        notifyTelegramChatId: r.notify_telegram_chat_id || undefined,
        notifyDiscordWebhook: r.notify_discord_webhook || undefined,
        quietHoursStart: r.quiet_hours_start || undefined,
        quietHoursEnd: r.quiet_hours_end || undefined,
        dailyDigestOnly: Boolean(r.daily_digest_only),
        selectorWarning: r.selector_warning || null,
        recentAlertStatus: r.recent_alert_status || null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }

    return [];
  }

  async getPageById(id: string): Promise<MonitoredPage | null> {
    if (this.engineType === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(`
        SELECT 
          id, url, name, check_interval_minutes as "checkIntervalMinutes",
          sensitivity, status, watched_selectors as "watchedSelectors",
          ignored_selectors as "ignoredSelectors", last_checked_at as "lastCheckedAt",
          last_attempted_check_at as "lastAttemptedCheckAt",
          last_successful_check_at as "lastSuccessfulCheckAt",
          last_changed_at as "lastChangedAt", next_check_at as "nextCheckAt",
          last_error as "lastError", current_hash as "currentHash",
          consecutive_failures as "consecutiveFailures",
          total_checks as "totalChecks", total_changes as "totalChanges",
          is_paused as "isPaused", notify_email as "notifyEmail",
          notify_telegram_chat_id as "notifyTelegramChatId",
          notify_discord_webhook as "notifyDiscordWebhook",
          quiet_hours_start as "quietHoursStart", quiet_hours_end as "quietHoursEnd",
          daily_digest_only as "dailyDigestOnly",
          selector_warning as "selectorWarning",
          recent_alert_status as "recentAlertStatus",
          created_at as "createdAt", updated_at as "updatedAt"
        FROM monitored_pages WHERE id = $1
      `, [id]);
      return res.rows[0] || null;
    }

    if (this.sqliteDb) {
      const r = this.sqliteDb.prepare(`
        SELECT * FROM monitored_pages WHERE id = ?
      `).get(id) as any;

      if (!r) return null;
      return {
        id: r.id,
        url: r.url,
        name: r.name,
        checkIntervalMinutes: r.check_interval_minutes,
        sensitivity: r.sensitivity,
        status: r.status,
        watchedSelectors: JSON.parse(r.watched_selectors || '[]'),
        ignoredSelectors: JSON.parse(r.ignored_selectors || '[]'),
        lastCheckedAt: r.last_checked_at,
        lastAttemptedCheckAt: r.last_attempted_check_at || r.last_checked_at || null,
        lastSuccessfulCheckAt: r.last_successful_check_at || null,
        lastChangedAt: r.last_changed_at,
        nextCheckAt: r.next_check_at,
        lastError: r.last_error,
        currentHash: r.current_hash,
        consecutiveFailures: r.consecutive_failures || 0,
        totalChecks: r.total_checks,
        totalChanges: r.total_changes,
        isPaused: Boolean(r.is_paused),
        notifyEmail: r.notify_email || undefined,
        notifyTelegramChatId: r.notify_telegram_chat_id || undefined,
        notifyDiscordWebhook: r.notify_discord_webhook || undefined,
        quietHoursStart: r.quiet_hours_start || undefined,
        quietHoursEnd: r.quiet_hours_end || undefined,
        dailyDigestOnly: Boolean(r.daily_digest_only),
        selectorWarning: r.selector_warning || null,
        recentAlertStatus: r.recent_alert_status || null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }

    return null;
  }

  async createPage(page: MonitoredPage): Promise<MonitoredPage> {
    if (this.engineType === 'postgres' && this.pgPool) {
      await this.pgPool.query(`
        INSERT INTO monitored_pages (
          id, url, name, check_interval_minutes, sensitivity, status,
          watched_selectors, ignored_selectors, is_paused,
          notify_email, notify_telegram_chat_id, notify_discord_webhook,
          quiet_hours_start, quiet_hours_end, daily_digest_only,
          last_checked_at, last_attempted_check_at, last_successful_check_at,
          last_changed_at, next_check_at, last_error, current_hash,
          consecutive_failures, total_checks, total_changes,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
        )
      `, [
        page.id, page.url, page.name, page.checkIntervalMinutes, page.sensitivity,
        page.status, JSON.stringify(page.watchedSelectors || []), JSON.stringify(page.ignoredSelectors || []),
        page.isPaused || false, page.notifyEmail || null, page.notifyTelegramChatId || null,
        page.notifyDiscordWebhook || null, page.quietHoursStart || null, page.quietHoursEnd || null,
        page.dailyDigestOnly || false, page.lastCheckedAt || null, page.lastAttemptedCheckAt || null,
        page.lastSuccessfulCheckAt || null, page.lastChangedAt || null, page.nextCheckAt || null,
        page.lastError || null, page.currentHash || null, page.consecutiveFailures || 0,
        page.totalChecks || 0, page.totalChanges || 0, page.createdAt, page.updatedAt
      ]);
      return page;
    }

    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare(`
        INSERT INTO monitored_pages (
          id, url, name, check_interval_minutes, sensitivity, status,
          watched_selectors, ignored_selectors, is_paused,
          notify_email, notify_telegram_chat_id, notify_discord_webhook,
          quiet_hours_start, quiet_hours_end, daily_digest_only,
          last_checked_at, last_attempted_check_at, last_successful_check_at,
          last_changed_at, next_check_at, last_error, current_hash,
          consecutive_failures, total_checks, total_changes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        page.id,
        page.url,
        page.name,
        page.checkIntervalMinutes,
        page.sensitivity,
        page.status,
        JSON.stringify(page.watchedSelectors || []),
        JSON.stringify(page.ignoredSelectors || []),
        page.isPaused ? 1 : 0,
        page.notifyEmail || null,
        page.notifyTelegramChatId || null,
        page.notifyDiscordWebhook || null,
        page.quietHoursStart || null,
        page.quietHoursEnd || null,
        page.dailyDigestOnly ? 1 : 0,
        page.lastCheckedAt || null,
        page.lastAttemptedCheckAt || null,
        page.lastSuccessfulCheckAt || null,
        page.lastChangedAt || null,
        page.nextCheckAt || null,
        page.lastError || null,
        page.currentHash || null,
        page.consecutiveFailures || 0,
        page.totalChecks || 0,
        page.totalChanges || 0,
        page.createdAt,
        page.updatedAt
      );
      return page;
    }

    return page;
  }

  async updatePage(id: string, updates: Partial<MonitoredPage>): Promise<MonitoredPage | null> {
    const existing = await this.getPageById(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };

    if (this.engineType === 'postgres' && this.pgPool) {
      await this.pgPool.query(`
        UPDATE monitored_pages SET
          url = $1, name = $2, check_interval_minutes = $3, sensitivity = $4,
          status = $5, watched_selectors = $6, ignored_selectors = $7,
          last_checked_at = $8, last_changed_at = $9, next_check_at = $10,
          last_error = $11, current_hash = $12, total_checks = $13,
          total_changes = $14, is_paused = $15, notify_email = $16,
          notify_telegram_chat_id = $17, notify_discord_webhook = $18,
          quiet_hours_start = $19, quiet_hours_end = $20, daily_digest_only = $21,
          last_attempted_check_at = $22, last_successful_check_at = $23,
          consecutive_failures = $24, selector_warning = $25, recent_alert_status = $26,
          updated_at = $27
        WHERE id = $28
      `, [
        merged.url, merged.name, merged.checkIntervalMinutes, merged.sensitivity,
        merged.status, JSON.stringify(merged.watchedSelectors || []), JSON.stringify(merged.ignoredSelectors || []),
        merged.lastCheckedAt || null, merged.lastChangedAt || null, merged.nextCheckAt || null,
        merged.lastError || null, merged.currentHash || null, merged.totalChecks || 0,
        merged.totalChanges || 0, merged.isPaused, merged.notifyEmail || null,
        merged.notifyTelegramChatId || null, merged.notifyDiscordWebhook || null,
        merged.quietHoursStart || null, merged.quietHoursEnd || null, merged.dailyDigestOnly || false,
        merged.lastAttemptedCheckAt || null, merged.lastSuccessfulCheckAt || null,
        merged.consecutiveFailures || 0, merged.selectorWarning || null, merged.recentAlertStatus || null,
        merged.updatedAt, id
      ]);
      return merged;
    }

    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare(`
        UPDATE monitored_pages SET
          url = ?, name = ?, check_interval_minutes = ?, sensitivity = ?,
          status = ?, watched_selectors = ?, ignored_selectors = ?,
          last_checked_at = ?, last_changed_at = ?, next_check_at = ?,
          last_error = ?, current_hash = ?, total_checks = ?,
          total_changes = ?, is_paused = ?, notify_email = ?,
          notify_telegram_chat_id = ?, notify_discord_webhook = ?,
          quiet_hours_start = ?, quiet_hours_end = ?, daily_digest_only = ?,
          last_attempted_check_at = ?, last_successful_check_at = ?,
          consecutive_failures = ?, selector_warning = ?, recent_alert_status = ?,
          updated_at = ?
        WHERE id = ?
      `);

      stmt.run(
        merged.url,
        merged.name,
        merged.checkIntervalMinutes,
        merged.sensitivity,
        merged.status,
        JSON.stringify(merged.watchedSelectors || []),
        JSON.stringify(merged.ignoredSelectors || []),
        merged.lastCheckedAt || null,
        merged.lastChangedAt || null,
        merged.nextCheckAt || null,
        merged.lastError || null,
        merged.currentHash || null,
        merged.totalChecks || 0,
        merged.totalChanges || 0,
        merged.isPaused ? 1 : 0,
        merged.notifyEmail || null,
        merged.notifyTelegramChatId || null,
        merged.notifyDiscordWebhook || null,
        merged.quietHoursStart || null,
        merged.quietHoursEnd || null,
        merged.dailyDigestOnly ? 1 : 0,
        merged.lastAttemptedCheckAt || null,
        merged.lastSuccessfulCheckAt || null,
        merged.consecutiveFailures || 0,
        merged.selectorWarning || null,
        merged.recentAlertStatus || null,
        merged.updatedAt,
        id
      );
      return merged;
    }

    return null;
  }

  async deletePage(id: string): Promise<boolean> {
    if (this.engineType === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query('DELETE FROM monitored_pages WHERE id = $1', [id]);
      return (res.rowCount ?? 0) > 0;
    }

    if (this.sqliteDb) {
      this.sqliteDb.prepare('DELETE FROM page_snapshots WHERE page_id = ?').run(id);
      this.sqliteDb.prepare('DELETE FROM alert_notifications WHERE page_id = ?').run(id);
      const res = this.sqliteDb.prepare('DELETE FROM monitored_pages WHERE id = ?').run(id);
      return res.changes > 0;
    }

    return false;
  }

  // --- Snapshots Methods ---

  async getSnapshots(pageId: string): Promise<PageSnapshot[]> {
    if (this.engineType === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(`
        SELECT 
          id, page_id as "pageId", version_number as "versionNumber",
          content_hash as "contentHash", normalized_text as "normalizedText",
          raw_text_preview as "rawTextPreview", screenshot_url as "screenshotUrl",
          screenshot_path as "screenshotPath", checked_at as "checkedAt",
          is_meaningful_change as "isMeaningfulChange", change_summary as "changeSummary",
          http_status as "httpStatus", response_time_ms as "responseTimeMs",
          extracted_title as "extractedTitle"
        FROM page_snapshots
        WHERE page_id = $1
        ORDER BY version_number DESC
      `, [pageId]);
      return res.rows;
    }

    if (this.sqliteDb) {
      const rows = this.sqliteDb.prepare(`
        SELECT * FROM page_snapshots WHERE page_id = ? ORDER BY version_number DESC
      `).all(pageId) as any[];

      return rows.map(r => ({
        id: r.id,
        pageId: r.page_id,
        versionNumber: r.version_number,
        contentHash: r.content_hash,
        normalizedText: r.normalized_text,
        rawTextPreview: r.raw_text_preview,
        screenshotUrl: r.screenshot_url,
        screenshotPath: r.screenshot_path,
        checkedAt: r.checked_at,
        isMeaningfulChange: Boolean(r.is_meaningful_change),
        changeSummary: r.change_summary,
        httpStatus: r.http_status,
        responseTimeMs: r.response_time_ms,
        extractedTitle: r.extracted_title,
      }));
    }

    return [];
  }

  async getSnapshotById(id: string): Promise<PageSnapshot | null> {
    if (this.engineType === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(`
        SELECT 
          id, page_id as "pageId", version_number as "versionNumber",
          content_hash as "contentHash", normalized_text as "normalizedText",
          raw_text_preview as "rawTextPreview", screenshot_url as "screenshotUrl",
          screenshot_path as "screenshotPath", checked_at as "checkedAt",
          is_meaningful_change as "isMeaningfulChange", change_summary as "changeSummary",
          http_status as "httpStatus", response_time_ms as "responseTimeMs",
          extracted_title as "extractedTitle"
        FROM page_snapshots WHERE id = $1
      `, [id]);
      return res.rows[0] || null;
    }

    if (this.sqliteDb) {
      const r = this.sqliteDb.prepare(`
        SELECT * FROM page_snapshots WHERE id = ?
      `).get(id) as any;

      if (!r) return null;
      return {
        id: r.id,
        pageId: r.page_id,
        versionNumber: r.version_number,
        contentHash: r.content_hash,
        normalizedText: r.normalized_text,
        rawTextPreview: r.raw_text_preview,
        screenshotUrl: r.screenshot_url,
        screenshotPath: r.screenshot_path,
        checkedAt: r.checked_at,
        isMeaningfulChange: Boolean(r.is_meaningful_change),
        changeSummary: r.change_summary,
        httpStatus: r.http_status,
        responseTimeMs: r.response_time_ms,
        extractedTitle: r.extracted_title,
      };
    }

    return null;
  }

  async getLatestSnapshot(pageId: string): Promise<PageSnapshot | null> {
    const list = await this.getSnapshots(pageId);
    return list.length > 0 ? list[0] : null;
  }

  async createSnapshot(snapshot: PageSnapshot): Promise<PageSnapshot> {
    if (this.engineType === 'postgres' && this.pgPool) {
      await this.pgPool.query(`
        INSERT INTO page_snapshots (
          id, page_id, version_number, content_hash, normalized_text,
          raw_text_preview, screenshot_url, screenshot_path, checked_at,
          is_meaningful_change, change_summary, http_status, response_time_ms, extracted_title
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
      `, [
        snapshot.id, snapshot.pageId, snapshot.versionNumber, snapshot.contentHash,
        snapshot.normalizedText, snapshot.rawTextPreview, snapshot.screenshotUrl || null,
        snapshot.screenshotPath || null, snapshot.checkedAt, snapshot.isMeaningfulChange,
        snapshot.changeSummary || null, snapshot.httpStatus, snapshot.responseTimeMs,
        snapshot.extractedTitle || null
      ]);
      return snapshot;
    }

    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare(`
        INSERT INTO page_snapshots (
          id, page_id, version_number, content_hash, normalized_text,
          raw_text_preview, screenshot_url, screenshot_path, checked_at,
          is_meaningful_change, change_summary, http_status, response_time_ms, extracted_title
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        snapshot.id,
        snapshot.pageId,
        snapshot.versionNumber,
        snapshot.contentHash,
        snapshot.normalizedText,
        snapshot.rawTextPreview || null,
        snapshot.screenshotUrl || null,
        snapshot.screenshotPath || null,
        snapshot.checkedAt,
        snapshot.isMeaningfulChange ? 1 : 0,
        snapshot.changeSummary || null,
        snapshot.httpStatus,
        snapshot.responseTimeMs,
        snapshot.extractedTitle || null
      );
      return snapshot;
    }

    return snapshot;
  }

  // --- Alerts & Notifications Methods ---

  async getAlerts(limit = 50): Promise<AlertNotification[]> {
    if (this.engineType === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(`
        SELECT 
          id, page_id as "pageId", page_name as "pageName", page_url as "pageUrl",
          version_number as "versionNumber", channel, destination, status,
          message, error, sent_at as "sentAt", idempotency_key as "idempotencyKey"
        FROM alert_notifications
        ORDER BY sent_at DESC
        LIMIT $1
      `, [limit]);
      return res.rows;
    }

    if (this.sqliteDb) {
      const rows = this.sqliteDb.prepare(`
        SELECT * FROM alert_notifications ORDER BY sent_at DESC LIMIT ?
      `).all(limit) as any[];

      return rows.map(r => ({
        id: r.id,
        pageId: r.page_id,
        pageName: r.page_name,
        pageUrl: r.page_url,
        versionNumber: r.version_number,
        channel: r.channel,
        destination: r.destination,
        status: r.status,
        message: r.message,
        error: r.error || undefined,
        sentAt: r.sent_at,
        idempotencyKey: r.idempotency_key,
      }));
    }

    return [];
  }

  async createAlert(alert: AlertNotification): Promise<AlertNotification> {
    if (this.engineType === 'postgres' && this.pgPool) {
      await this.pgPool.query(`
        INSERT INTO alert_notifications (
          id, page_id, page_name, page_url, version_number, channel,
          destination, status, message, error, sent_at, idempotency_key
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        )
        ON CONFLICT (idempotency_key) DO NOTHING
      `, [
        alert.id, alert.pageId, alert.pageName, alert.pageUrl, alert.versionNumber,
        alert.channel, alert.destination, alert.status, alert.message,
        alert.error || null, alert.sentAt, alert.idempotencyKey
      ]);
      return alert;
    }

    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare(`
        INSERT OR IGNORE INTO alert_notifications (
          id, page_id, page_name, page_url, version_number, channel,
          destination, status, message, error, sent_at, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        alert.id,
        alert.pageId,
        alert.pageName,
        alert.pageUrl,
        alert.versionNumber,
        alert.channel,
        alert.destination,
        alert.status,
        alert.message,
        alert.error || null,
        alert.sentAt,
        alert.idempotencyKey
      );
      return alert;
    }

    return alert;
  }

  async isIdempotencyKeyUsed(key: string): Promise<boolean> {
    if (this.engineType === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query('SELECT 1 FROM alert_notifications WHERE idempotency_key = $1', [key]);
      return res.rows.length > 0;
    }

    if (this.sqliteDb) {
      const row = this.sqliteDb.prepare('SELECT 1 FROM alert_notifications WHERE idempotency_key = ?').get(key);
      return Boolean(row);
    }

    return false;
  }

  async clearAlerts(): Promise<boolean> {
    if (this.engineType === 'postgres' && this.pgPool) {
      await this.pgPool.query('DELETE FROM alert_notifications');
      return true;
    }

    if (this.sqliteDb) {
      this.sqliteDb.prepare('DELETE FROM alert_notifications').run();
      return true;
    }

    return false;
  }

  // --- Cross-Worker / Cross-Subscription Shared URL Fetches ---

  async getSharedFetch(url: string): Promise<FetchResult | null> {
    const nowIso = new Date().toISOString();

    if (this.engineType === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(
        'SELECT html, screenshot_path as "screenshotPath", screenshot_url as "screenshotUrl", http_status as "httpStatus", response_time_ms as "responseTimeMs" FROM shared_url_fetches WHERE url = $1 AND expires_at > NOW()',
        [url]
      );
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          success: true,
          httpStatus: row.httpStatus,
          html: row.html,
          screenshotPath: row.screenshotPath,
          screenshotUrl: row.screenshotUrl,
          responseTimeMs: row.responseTimeMs,
        };
      }
      return null;
    }

    if (this.sqliteDb) {
      const row = this.sqliteDb.prepare(
        'SELECT html, screenshot_path, screenshot_url, http_status, response_time_ms FROM shared_url_fetches WHERE url = ? AND expires_at > ?'
      ).get(url, nowIso) as any;

      if (row) {
        return {
          success: true,
          httpStatus: row.http_status,
          html: row.html,
          screenshotPath: row.screenshot_path,
          screenshotUrl: row.screenshot_url,
          responseTimeMs: row.response_time_ms,
        };
      }
    }

    return null;
  }

  async saveSharedFetch(url: string, result: FetchResult, ttlSeconds: number = 60): Promise<void> {
    if (!result.success || !result.html) return;
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

    if (this.engineType === 'postgres' && this.pgPool) {
      await this.pgPool.query(`
        INSERT INTO shared_url_fetches (url, html, screenshot_path, screenshot_url, http_status, response_time_ms, fetched_at, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (url) DO UPDATE SET
          html = EXCLUDED.html,
          screenshot_path = EXCLUDED.screenshot_path,
          screenshot_url = EXCLUDED.screenshot_url,
          http_status = EXCLUDED.http_status,
          response_time_ms = EXCLUDED.response_time_ms,
          fetched_at = EXCLUDED.fetched_at,
          expires_at = EXCLUDED.expires_at
      `, [url, result.html, result.screenshotPath || null, result.screenshotUrl || null, result.httpStatus, result.responseTimeMs, nowIso, expiresAt]);
      return;
    }

    if (this.sqliteDb) {
      this.sqliteDb.prepare(`
        INSERT INTO shared_url_fetches (url, html, screenshot_path, screenshot_url, http_status, response_time_ms, fetched_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (url) DO UPDATE SET
          html = excluded.html,
          screenshot_path = excluded.screenshot_path,
          screenshot_url = excluded.screenshot_url,
          http_status = excluded.http_status,
          response_time_ms = excluded.response_time_ms,
          fetched_at = excluded.fetched_at,
          expires_at = excluded.expires_at
      `).run(
        url,
        result.html,
        result.screenshotPath || null,
        result.screenshotUrl || null,
        result.httpStatus,
        result.responseTimeMs,
        nowIso,
        expiresAt
      );
    }
  }

  async cleanupExpiredSharedFetches(): Promise<void> {
    const nowIso = new Date().toISOString();
    if (this.engineType === 'postgres' && this.pgPool) {
      await this.pgPool.query('DELETE FROM shared_url_fetches WHERE expires_at <= NOW()');
    } else if (this.sqliteDb) {
      this.sqliteDb.prepare('DELETE FROM shared_url_fetches WHERE expires_at <= ?').run(nowIso);
    }
  }

  // --- Stats / Diagnostics ---

  async getHealthStats() {
    const pages = await this.getPages();
    let snapshotsCount = 0;

    if (this.engineType === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query('SELECT COUNT(*) as count FROM page_snapshots');
      snapshotsCount = Number(res.rows[0].count);
    } else if (this.sqliteDb) {
      const res = this.sqliteDb.prepare('SELECT COUNT(*) as count FROM page_snapshots').get() as any;
      snapshotsCount = Number(res?.count || 0);
    }

    return {
      type: this.engineType,
      path: this.engineType === 'sqlite_local' ? SQLITE_DB_PATH : undefined,
      connected: true,
      pagesCount: pages.length,
      snapshotsCount,
    };
  }
}

export const db = new DatabaseStore();
