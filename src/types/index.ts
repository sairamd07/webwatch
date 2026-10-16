export type PageStatus = 'OK' | 'CHANGED' | 'ERROR' | 'BLOCKED' | 'PAUSED';
export type SensitivityLevel = 'low' | 'medium' | 'high';
export type AlertChannel = 'email' | 'telegram' | 'discord';

export interface MonitoredPage {
  id: string;
  url: string;
  name: string;
  checkIntervalMinutes: number; // 15 to 1440
  sensitivity: SensitivityLevel;
  status: PageStatus;
  watchedSelectors: string[];
  ignoredSelectors: string[];
  lastCheckedAt?: string | null;
  lastAttemptedCheckAt?: string | null;
  lastSuccessfulCheckAt?: string | null;
  lastChangedAt?: string | null;
  nextCheckAt?: string | null;
  lastError?: string | null;
  currentHash?: string | null;
  consecutiveFailures?: number;
  totalChecks: number;
  totalChanges: number;
  createdAt: string;
  updatedAt: string;
  isPaused: boolean;
  // Notification preferences
  notifyEmail?: string;
  notifyTelegramChatId?: string;
  notifyDiscordWebhook?: string;
  quietHoursStart?: string; // e.g., "22:00"
  quietHoursEnd?: string;   // e.g., "07:00"
  dailyDigestOnly?: boolean;
  selectorWarning?: string | null;
  recentAlertStatus?: string | null;
}

export interface PageSnapshot {
  id: string;
  pageId: string;
  versionNumber: number;
  contentHash: string;
  normalizedText: string;
  rawTextPreview: string;
  screenshotUrl?: string | null;
  screenshotPath?: string | null;
  checkedAt: string;
  isMeaningfulChange: boolean;
  changeSummary?: string;
  httpStatus: number;
  responseTimeMs: number;
  extractedTitle?: string;
}

export interface DiffResult {
  hasMeaningfulChange: boolean;
  changePercentage: number;
  textDiff: {
    addedWords: number;
    removedWords: number;
    lines: Array<{
      type: 'added' | 'removed' | 'unchanged';
      value: string;
    }>;
  };
  visualDiff?: {
    diffPercentage: number;
    diffImageUrl?: string | null;
    baselineImageUrl?: string | null;
    currentImageUrl?: string | null;
  };
  summary: string;
}

export interface AlertNotification {
  id: string;
  pageId: string;
  pageName: string;
  pageUrl: string;
  versionNumber: number;
  channel: AlertChannel;
  destination: string;
  status: 'SENT' | 'FAILED' | 'SUPPRESSED_QUIET_HOURS' | 'DEDUPLICATED' | 'SKIPPED_UNCONFIGURED' | 'QUEUED_FOR_DIGEST';
  message: string;
  error?: string;
  sentAt: string;
  idempotencyKey: string;
}

export interface InspectionResult {
  url: string;
  title: string;
  httpStatus: number;
  elements: Array<{
    selector: string;
    tag: string;
    id?: string;
    className?: string;
    previewText: string;
    elementCount: number;
  }>;
  screenshotUrl?: string | null;
}

export interface SystemHealthStatus {
  status: 'healthy' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  environmentMode: 'local_development' | 'production_docker';
  database: {
    type: 'postgres' | 'sqlite_local';
    path?: string;
    connected: boolean;
    pagesCount: number;
    snapshotsCount: number;
  };
  queue: {
    type: 'bullmq_redis' | 'internal_priority';
    activeJobs: number;
    waitingJobs: number;
    isRedisConnected: boolean;
    modeDescription: string;
  };
  storage: {
    screenshotsCount: number;
    diskUsageBytes: number;
  };
  playwright: {
    available: boolean;
    engine: 'playwright_chromium' | 'http_resilient_fetcher';
  };
  integrations: {
    smtpConfigured: boolean;
    telegramConfigured: boolean;
    discordReady: boolean;
  };
}
