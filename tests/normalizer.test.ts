import { describe, it, expect } from 'vitest';
import { extractAndNormalizeContent } from '../src/server/monitoring/normalizer.js';

describe('Content Normalizer & Noise Filter', () => {
  it('strips scripts, styles, and cookie banners', () => {
    const rawHtml = `
      <html>
        <head><title>Test Page</title><style>.hidden { display: none; }</style></head>
        <body>
          <script>console.log('secret');</script>
          <div id="cookie-banner">Please accept cookies</div>
          <main>
            <h1>Welcome to Product</h1>
            <p>Our monthly plan is $19.</p>
          </main>
        </body>
      </html>
    `;

    const result = extractAndNormalizeContent(rawHtml);
    expect(result.title).toBe('Test Page');
    expect(result.normalizedText).toContain('Welcome to Product');
    expect(result.normalizedText).toContain('Our monthly plan is $19.');
    expect(result.normalizedText).not.toContain('console.log');
    expect(result.normalizedText).not.toContain('Please accept cookies');
  });

  it('normalizes dynamic ISO timestamps into token placeholders', () => {
    const html1 = '<p>Updated on 2026-10-12T12:00:00Z by admin.</p>';
    const html2 = '<p>Updated on 2026-10-12T13:45:00Z by admin.</p>';

    const res1 = extractAndNormalizeContent(html1);
    const res2 = extractAndNormalizeContent(html2);

    expect(res1.normalizedText).toBe(res2.normalizedText);
    expect(res1.normalizedText).toContain('[TIMESTAMP]');
  });

  it('respects user-specified ignored selectors', () => {
    const html = `
      <div>
        <div class="ad-banner">Flash Sale 50% Off!</div>
        <div class="article">Important Policy Update</div>
      </div>
    `;

    const result = extractAndNormalizeContent(html, {
      ignoredSelectors: ['.ad-banner'],
    });

    expect(result.normalizedText).toContain('Important Policy Update');
    expect(result.normalizedText).not.toContain('Flash Sale');
  });

  it('respects user-specified watched selectors', () => {
    const html = `
      <div>
        <div id="sidebar">Random Links</div>
        <div id="pricing-tier">$99 Enterprise</div>
      </div>
    `;

    const result = extractAndNormalizeContent(html, {
      watchedSelectors: ['#pricing-tier'],
    });

    expect(result.normalizedText).toContain('$99 Enterprise');
    expect(result.normalizedText).not.toContain('Random Links');
  });

  it('filters out dynamic counters, rotating banners, and tickers', () => {
    const html1 = `
      <div>
        <div class="ticker">Breaking news headline rotating</div>
        <div class="carousel">Image slide 1</div>
        <div class="visitor-count">1,240 people viewing this item</div>
        <main>
          <h1>Standard Plan</h1>
          <p>Page views: 42095</p>
          <p>Features included: Unlimited checks.</p>
        </main>
      </div>
    `;
    const html2 = `
      <div>
        <div class="ticker">Different breaking news ticker</div>
        <div class="carousel">Image slide 3</div>
        <div class="visitor-count">3,890 people viewing this item</div>
        <main>
          <h1>Standard Plan</h1>
          <p>Page views: 89412</p>
          <p>Features included: Unlimited checks.</p>
        </main>
      </div>
    `;

    const res1 = extractAndNormalizeContent(html1);
    const res2 = extractAndNormalizeContent(html2);

    expect(res1.normalizedText).not.toContain('Breaking news');
    expect(res1.normalizedText).not.toContain('Image slide');
    expect(res1.normalizedText).toContain('Standard Plan');
    expect(res1.normalizedText).toContain('Features included: Unlimited checks.');
    // Dynamic page view numbers should be normalized so trivial count changes don't alert
    expect(res1.normalizedText).toBe(res2.normalizedText);
  });

  it('accurately reports unmatched selectors when DOM elements no longer exist', () => {
    const html = `
      <main>
        <div class="content">Current active content</div>
      </main>
    `;

    const result = extractAndNormalizeContent(html, {
      watchedSelectors: ['.content', '#old-discontinued-element', '.missing-sidebar'],
    });

    expect(result.matchedWatchedCount).toBe(1);
    expect(result.unmatchedSelectors).toEqual(['#old-discontinued-element', '.missing-sidebar']);
  });
});
