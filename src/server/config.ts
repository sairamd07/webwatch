import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'webwatch-notifications@example.com',
  },
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  storageDir: path.resolve(process.cwd(), 'storage'),
  screenshotsDir: path.resolve(process.cwd(), 'storage', 'screenshots'),
  maxConcurrentChecks: 3,
  defaultTimeoutMs: 30000,
  minCheckIntervalMinutes: 15,
};

// Ensure storage directories exist
if (!fs.existsSync(config.storageDir)) {
  fs.mkdirSync(config.storageDir, { recursive: true });
}
if (!fs.existsSync(config.screenshotsDir)) {
  fs.mkdirSync(config.screenshotsDir, { recursive: true });
}
