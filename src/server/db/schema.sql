-- WebWatch Database Schema
-- Compatible with PostgreSQL 14+

CREATE TABLE IF NOT EXISTS monitored_pages (
    id VARCHAR(64) PRIMARY KEY,
    url TEXT NOT NULL,
    name VARCHAR(255) NOT NULL,
    check_interval_minutes INT NOT NULL DEFAULT 60,
    sensitivity VARCHAR(32) NOT NULL DEFAULT 'medium',
    status VARCHAR(32) NOT NULL DEFAULT 'OK',
    watched_selectors JSONB DEFAULT '[]'::jsonb,
    ignored_selectors JSONB DEFAULT '[]'::jsonb,
    last_checked_at TIMESTAMPTZ,
    last_attempted_check_at TIMESTAMPTZ,
    last_successful_check_at TIMESTAMPTZ,
    last_changed_at TIMESTAMPTZ,
    next_check_at TIMESTAMPTZ,
    last_error TEXT,
    current_hash VARCHAR(128),
    consecutive_failures INT DEFAULT 0,
    total_checks INT DEFAULT 0,
    total_changes INT DEFAULT 0,
    is_paused BOOLEAN DEFAULT FALSE,
    notify_email VARCHAR(255),
    notify_telegram_chat_id VARCHAR(128),
    notify_discord_webhook TEXT,
    quiet_hours_start VARCHAR(10),
    quiet_hours_end VARCHAR(10),
    daily_digest_only BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS page_snapshots (
    id VARCHAR(64) PRIMARY KEY,
    page_id VARCHAR(64) NOT NULL REFERENCES monitored_pages(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    content_hash VARCHAR(128) NOT NULL,
    normalized_text TEXT NOT NULL,
    raw_text_preview TEXT,
    screenshot_url TEXT,
    screenshot_path TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_meaningful_change BOOLEAN DEFAULT FALSE,
    change_summary TEXT,
    http_status INT NOT NULL,
    response_time_ms INT NOT NULL DEFAULT 0,
    extracted_title TEXT
);

CREATE TABLE IF NOT EXISTS alert_notifications (
    id VARCHAR(64) PRIMARY KEY,
    page_id VARCHAR(64) NOT NULL REFERENCES monitored_pages(id) ON DELETE CASCADE,
    page_name VARCHAR(255) NOT NULL,
    page_url TEXT NOT NULL,
    version_number INT NOT NULL,
    channel VARCHAR(32) NOT NULL,
    destination TEXT NOT NULL,
    status VARCHAR(32) NOT NULL,
    message TEXT NOT NULL,
    error TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idempotency_key VARCHAR(255) UNIQUE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_monitored_pages_status ON monitored_pages(status);
CREATE INDEX IF NOT EXISTS idx_monitored_pages_next_check ON monitored_pages(next_check_at);
CREATE INDEX IF NOT EXISTS idx_page_snapshots_page_id ON page_snapshots(page_id);
CREATE INDEX IF NOT EXISTS idx_page_snapshots_version ON page_snapshots(page_id, version_number);
CREATE INDEX IF NOT EXISTS idx_alert_notifications_page_id ON alert_notifications(page_id);
CREATE INDEX IF NOT EXISTS idx_alert_notifications_idempotency ON alert_notifications(idempotency_key);

-- Shared URL Fetches across workers and subscriptions
CREATE TABLE IF NOT EXISTS shared_url_fetches (
    url TEXT PRIMARY KEY,
    html TEXT NOT NULL,
    screenshot_path TEXT,
    screenshot_url TEXT,
    http_status INT NOT NULL,
    response_time_ms INT NOT NULL DEFAULT 0,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shared_url_fetches_expires ON shared_url_fetches(expires_at);
