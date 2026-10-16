import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { validateUrlAgainstSSRF } from './ssrf.js';
import { config } from '../config.js';

export interface FetchResult {
  success: boolean;
  httpStatus: number;
  html: string;
  screenshotPath?: string;
  screenshotUrl?: string;
  responseTimeMs: number;
  error?: string;
  isBlocked?: boolean;
  blockReason?: string;
  isTransient?: boolean;
}

// CAPTCHA, Bot Defense, and Access Denied block indicators
const CHALLENGE_INDICATORS = [
  'cf-turnstile',
  'challenges.cloudflare.com',
  'attention required! | cloudflare',
  'just a moment...',
  'g-recaptcha',
  'hcaptcha.com',
  'please verify you are a human',
  'shield-screen',
  'ddos protection by cloudflare',
  'checking your browser before accessing',
  'security check to access',
  'you do not have permission to access',
  'you don\'t have permission to access',
  'access denied - imperva',
  'access denied | akamai',
];

/**
 * Checks robots.txt to respect site policies for WebWatchBot.
 */
async function checkRobotsTxt(targetUrl: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const parsed = new URL(targetUrl);
    const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(robotsUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'WebWatchBot/1.0 (+https://webwatch.example.com)' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { allowed: true };
    }

    const text = await res.text();
    const lines = text.split('\n');
    let appliesToAll = false;
    let appliesToBot = false;

    for (const rawLine of lines) {
      const line = rawLine.trim().toLowerCase();
      if (line.startsWith('user-agent:')) {
        const agent = line.replace('user-agent:', '').trim();
        appliesToAll = agent === '*';
        appliesToBot = agent.includes('webwatchbot');
      }

      if ((appliesToAll || appliesToBot) && line.startsWith('disallow:')) {
        const pathPattern = line.replace('disallow:', '').trim();
        if (pathPattern === '/' || (pathPattern && parsed.pathname.startsWith(pathPattern))) {
          return {
            allowed: false,
            reason: `Robots.txt prohibits monitoring for path "${parsed.pathname}" under Disallow: ${pathPattern}`,
          };
        }
      }
    }

    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

/**
 * Creates an informative fallback screenshot image (PNG) when browser headless display
 * cannot render or when running HTTP fallback mode.
 */
async function generateFallbackScreenshot(
  pageId: string,
  url: string,
  title: string,
  status: number
): Promise<{ screenshotPath: string; screenshotUrl: string }> {
  const filename = `${pageId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.png`;
  const filePath = path.join(config.screenshotsDir, filename);

  const { PNG } = await import('pngjs');
  const png = new PNG({ width: 640, height: 360 });

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) << 2;
      if (x < 2 || x >= png.width - 2 || y < 2 || y >= png.height - 2) {
        png.data[idx] = 51;     // R
        png.data[idx + 1] = 65; // G
        png.data[idx + 2] = 85; // B
        png.data[idx + 3] = 255;
      } else {
        png.data[idx] = 15;     // R
        png.data[idx + 1] = 23; // G
        png.data[idx + 2] = 42; // B
        png.data[idx + 3] = 255;
      }
    }
  }

  const buffer = PNG.sync.write(png);
  await fs.writeFile(filePath, buffer);

  return {
    screenshotPath: filePath,
    screenshotUrl: `/api/storage/screenshots/${filename}`,
  };
}

/**
 * Checks if HTML content contains bot defense, CAPTCHA, or access denied screens.
 */
export function detectChallengeInHtml(html: string): { isChallenge: boolean; challengeType?: string } {
  if (!html) return { isChallenge: false };
  const lowerHtml = html.toLowerCase();

  for (const indicator of CHALLENGE_INDICATORS) {
    if (lowerHtml.includes(indicator)) {
      return { isChallenge: true, challengeType: indicator };
    }
  }

  // Also check for access denied title or heading
  if (
    lowerHtml.includes('<title>403 forbidden</title>') ||
    lowerHtml.includes('<title>access denied</title>') ||
    lowerHtml.includes('<h1>403 forbidden</h1>') ||
    lowerHtml.includes('<h1>access denied</h1>')
  ) {
    return { isChallenge: true, challengeType: 'Access Denied / 403 Forbidden Screen' };
  }

  return { isChallenge: false };
}

/**
 * Performs a single attempt at loading the page via Playwright or HTTP fallback.
 */
async function performSingleFetch(
  url: string,
  pageId: string,
  timeoutMs: number
): Promise<FetchResult> {
  const startTime = Date.now();

  // Try Playwright Chromium
  let playwrightFailed = false;
  let playwrightError = '';

  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
      ],
    });

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 WebWatchBot/1.0',
        viewport: { width: 1280, height: 800 },
        ignoreHTTPSErrors: false,
      });

      const page = await context.newPage();
      page.setDefaultNavigationTimeout(timeoutMs);

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });

      const responseTimeMs = Date.now() - startTime;
      const httpStatus = response?.status() || 200;

      // Handle HTTP status code blocks and errors
      if (httpStatus === 403 || httpStatus === 401 || httpStatus === 407 || httpStatus === 429) {
        await browser.close();
        return {
          success: false,
          httpStatus,
          html: '',
          responseTimeMs,
          isBlocked: true,
          blockReason: httpStatus === 403
            ? 'Access forbidden (HTTP 403 Forbidden)'
            : httpStatus === 429
            ? 'Rate limited by site (HTTP 429 Too Many Requests)'
            : `Access unauthorized (HTTP ${httpStatus})`,
          error: `HTTP ${httpStatus} Forbidden/Blocked`,
          isTransient: false,
        };
      }

      if (httpStatus >= 500) {
        await browser.close();
        return {
          success: false,
          httpStatus,
          html: '',
          responseTimeMs,
          isBlocked: false,
          error: `Server failure (HTTP ${httpStatus})`,
          isTransient: true,
        };
      }

      if (httpStatus >= 400) {
        await browser.close();
        return {
          success: false,
          httpStatus,
          html: '',
          responseTimeMs,
          isBlocked: false,
          error: `Client error (HTTP ${httpStatus})`,
          isTransient: false,
        };
      }

      try {
        await page.waitForLoadState('networkidle', { timeout: 3000 });
      } catch {
        // Continue safely
      }

      const html = await page.content();

      // Check for challenge / CAPTCHA screen in rendered HTML
      const challenge = detectChallengeInHtml(html);
      if (challenge.isChallenge) {
        await browser.close();
        return {
          success: false,
          httpStatus,
          html,
          responseTimeMs,
          isBlocked: true,
          blockReason: `Access blocked by CAPTCHA / Bot Defense (${challenge.challengeType})`,
          error: `Anti-bot challenge screen detected (${challenge.challengeType})`,
          isTransient: false,
        };
      }

      const filename = `${pageId}-${Date.now()}.png`;
      const screenshotPath = path.join(config.screenshotsDir, filename);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      const screenshotUrl = `/api/storage/screenshots/${filename}`;

      await browser.close();

      return {
        success: true,
        httpStatus,
        html,
        screenshotPath,
        screenshotUrl,
        responseTimeMs,
      };
    } catch (err: unknown) {
      await browser.close().catch(() => {});
      throw err;
    }
  } catch (err: unknown) {
    playwrightFailed = true;
    playwrightError = err instanceof Error ? err.message : String(err);
  }

  // Resilient HTTP Fetcher Fallback
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 WebWatchBot/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    const responseTimeMs = Date.now() - startTime;
    const httpStatus = res.status;

    // Classify HTTP 403, 401, 429 as BLOCKED
    if (httpStatus === 403 || httpStatus === 401 || httpStatus === 407 || httpStatus === 429) {
      return {
        success: false,
        httpStatus,
        html: '',
        responseTimeMs,
        isBlocked: true,
        blockReason: httpStatus === 403
          ? 'Access forbidden (HTTP 403 Forbidden)'
          : httpStatus === 429
          ? 'Rate limited by site (HTTP 429 Too Many Requests)'
          : `Access unauthorized (HTTP ${httpStatus})`,
        error: `HTTP ${httpStatus} Forbidden/Blocked`,
        isTransient: false,
      };
    }

    if (httpStatus >= 500) {
      return {
        success: false,
        httpStatus,
        html: '',
        responseTimeMs,
        isBlocked: false,
        error: `Server failure (HTTP ${httpStatus} ${res.statusText})`,
        isTransient: true,
      };
    }

    if (!res.ok) {
      return {
        success: false,
        httpStatus,
        html: '',
        responseTimeMs,
        isBlocked: false,
        error: `HTTP ${httpStatus} ${res.statusText}`,
        isTransient: false,
      };
    }

    const html = await res.text();

    // Check challenge patterns
    const challenge = detectChallengeInHtml(html);
    if (challenge.isChallenge) {
      return {
        success: false,
        httpStatus,
        html,
        responseTimeMs,
        isBlocked: true,
        blockReason: `Anti-bot protection screen detected (${challenge.challengeType})`,
        error: `Page returned bot challenge (${challenge.challengeType})`,
        isTransient: false,
      };
    }

    const { screenshotPath, screenshotUrl } = await generateFallbackScreenshot(
      pageId,
      url,
      'WebWatch Snapshot',
      httpStatus
    );

    return {
      success: true,
      httpStatus,
      html,
      screenshotPath,
      screenshotUrl,
      responseTimeMs,
    };
  } catch (fetchErr: unknown) {
    const errMessage = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    const isTimeout = errMessage.toLowerCase().includes('aborted') || errMessage.toLowerCase().includes('timeout');

    return {
      success: false,
      httpStatus: 0,
      html: '',
      responseTimeMs: Date.now() - startTime,
      isBlocked: false,
      error: isTimeout
        ? `Request timed out after ${timeoutMs}ms.`
        : `Connection failure: ${errMessage}.`,
      isTransient: true, // Network timeouts and drops are transient
    };
  }
}

/**
 * Main Web Page Fetcher:
 * - Runs SSRF pre-check.
 * - Checks robots.txt policy.
 * - Executes bounded retries with exponential backoff for transient errors (5xx, timeouts).
 * - Immediately returns on persistent blocks (403, 429, CAPTCHA) WITHOUT repeated hammering.
 */
export async function fetchWebPage(
  url: string,
  pageId: string,
  timeoutMs = config.defaultTimeoutMs
): Promise<FetchResult> {
  // 1. SSRF Check
  const ssrfCheck = await validateUrlAgainstSSRF(url);
  if (!ssrfCheck.valid) {
    return {
      success: false,
      httpStatus: 400,
      html: '',
      responseTimeMs: 0,
      isBlocked: true,
      blockReason: `SSRF Security Block: ${ssrfCheck.error}`,
      error: ssrfCheck.error,
      isTransient: false,
    };
  }

  // 2. Robots.txt Compliance Check
  const robotsCheck = await checkRobotsTxt(url);
  if (!robotsCheck.allowed) {
    return {
      success: false,
      httpStatus: 403,
      html: '',
      responseTimeMs: 0,
      isBlocked: true,
      blockReason: robotsCheck.reason || 'Blocked by website robots.txt policy',
      error: robotsCheck.reason,
      isTransient: false,
    };
  }

  // 3. Execution with Bounded Retries for Transient Errors
  const maxRetries = 2; // Maximum 2 retries (3 total attempts)
  let lastResult: FetchResult = {
    success: false,
    httpStatus: 0,
    html: '',
    responseTimeMs: 0,
    error: 'Uninitialized fetch',
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await performSingleFetch(url, pageId, timeoutMs);

    // If successful, return immediately
    if (lastResult.success) {
      return lastResult;
    }

    // If it's a persistent block (HTTP 403, 429, CAPTCHA, access denied),
    // NEVER repeatedly retry! Immediately return the blocked result.
    if (lastResult.isBlocked) {
      return lastResult;
    }

    // If it's not transient (e.g. 404 Not Found), don't retry
    if (!lastResult.isTransient) {
      return lastResult;
    }

    // For transient errors (5xx server errors, network drop, timeout),
    // wait with exponential backoff before the next attempt
    if (attempt < maxRetries) {
      const backoffMs = Math.pow(2, attempt) * 500; // 500ms, 1000ms
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }

  return lastResult;
}
