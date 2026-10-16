import * as cheerio from 'cheerio';

export interface NormalizationOptions {
  watchedSelectors?: string[];
  ignoredSelectors?: string[];
  stripTimestamps?: boolean;
  stripRandomTokens?: boolean;
}

/**
 * Common noisy patterns (timestamps, dynamic counters, rotating tokens)
 */
const TIMESTAMP_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?\b/gi, // ISO timestamp
  /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s+\d{2}:\d{2}(:\d{2})?\b/gi, // RFC 2822
  /\b\d{1,2}\s+(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago\b/gi, // Relative times
  /\bjust\s+now\b/gi,
  /\bupdated\s+(at|on)?\s*:?\s*[\w\d\s,:-]+/gi, // "Updated at ..."
  /\bcopyright\s+©?\s*\d{4}\b/gi, // Copyright years
];

const RANDOM_TOKEN_PATTERNS = [
  /\b[0-9a-f]{32,64}\b/gi, // md5/sha256 hex tokens
  /\bcsrf[-_]?token\s*[:=]\s*['"]?[a-zA-Z0-9_\-]+['"]?/gi,
  /\bnonce\s*[:=]\s*['"]?[a-zA-Z0-9_\-]+['"]?/gi,
  /\bsession[-_]?id\s*[:=]\s*['"]?[a-zA-Z0-9_\-]+['"]?/gi,
  /\bauth[-_]?token\s*[:=]\s*['"]?[a-zA-Z0-9_\-]+['"]?/gi,
];

const DYNAMIC_COUNTER_PATTERNS = [
  /\b\d{1,9}\s+(views|visitors|active users|reads|likes|shares|clicks|items in cart)\b/gi,
  /\b(view count|page views?|visit count|online users?|readers?|current visitors?)\s*:\s*\d+\b/gi,
  /\b\d{1,6}\s+(people|users)\s+(viewing|watching|reading|online)\b/gi,
];

export interface NormalizationOptions {
  watchedSelectors?: string[];
  ignoredSelectors?: string[];
  stripTimestamps?: boolean;
  stripRandomTokens?: boolean;
  stripCounters?: boolean;
}

/**
 * Normalizes HTML content by selecting watched regions, stripping ignored regions,
 * filtering dynamic timestamps, counters, banners, and random tokens, and normalizing whitespace.
 */
export function extractAndNormalizeContent(
  html: string,
  options: NormalizationOptions = {}
): {
  normalizedText: string;
  rawPreview: string;
  title: string;
  matchedWatchedCount: number;
  unmatchedSelectors: string[];
} {
  const {
    watchedSelectors = [],
    ignoredSelectors = [],
    stripTimestamps = true,
    stripRandomTokens = true,
    stripCounters = true,
  } = options;

  const $ = cheerio.load(html);

  // Extract page title
  const title = $('title').first().text().trim() || 'Untitled Page';

  // Remove inherently non-content elements
  $('script, style, noscript, svg, link, iframe').remove();

  // Remove common third-party ad, cookie banner, rotating carousel/ticker, and counter elements
  $('[id*="cookie-banner"], [class*="cookie-consent"], [id*="google_ads"], [class*="advertisement"], [class*="ad-slot"], [class*="ad-banner"], [class*="rotating-banner"], [class*="ticker"], [class*="carousel"], [id*="carousel"], [class*="visitor-count"], [class*="live-counter"]').remove();

  // Remove user-configured ignored selectors
  for (const selector of ignoredSelectors) {
    if (selector && selector.trim()) {
      try {
        $(selector.trim()).remove();
      } catch {
        // Ignore invalid CSS selector in cheerio
      }
    }
  }

  let extractedText = '';
  let matchedWatchedCount = 0;
  const unmatchedSelectors: string[] = [];

  // If watched selectors are specified, only extract from those regions
  if (watchedSelectors && watchedSelectors.length > 0) {
    const textPieces: string[] = [];
    for (const selector of watchedSelectors) {
      if (selector && selector.trim()) {
        try {
          const elements = $(selector.trim());
          if (elements.length > 0) {
            matchedWatchedCount += elements.length;
            elements.each((_, el) => {
              textPieces.push($(el).text());
            });
          } else {
            unmatchedSelectors.push(selector.trim());
          }
        } catch {
          unmatchedSelectors.push(selector.trim());
        }
      }
    }
    extractedText = textPieces.join('\n');
  } else {
    // Extract main text from body
    extractedText = $('body').text() || $.text();
  }

  const rawPreview = extractedText.slice(0, 500).trim();

  // Apply noise filtering
  let cleaned = extractedText;

  if (stripTimestamps) {
    for (const pattern of TIMESTAMP_PATTERNS) {
      cleaned = cleaned.replace(pattern, ' [TIMESTAMP] ');
    }
  }

  if (stripRandomTokens) {
    for (const pattern of RANDOM_TOKEN_PATTERNS) {
      cleaned = cleaned.replace(pattern, ' [TOKEN] ');
    }
  }

  if (stripCounters) {
    for (const pattern of DYNAMIC_COUNTER_PATTERNS) {
      cleaned = cleaned.replace(pattern, ' [COUNTER] ');
    }
  }

  // Normalize whitespace:
  // Split into lines, trim each, filter out empty lines, collapse internal multi-spaces
  const normalizedLines = cleaned
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0);

  const normalizedText = normalizedLines.join('\n');

  return {
    normalizedText,
    rawPreview,
    title,
    matchedWatchedCount,
    unmatchedSelectors,
  };
}
