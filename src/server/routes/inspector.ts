import { Router } from 'express';
import * as cheerio from 'cheerio';
import { validateUrlAgainstSSRF } from '../monitoring/ssrf.js';

export const inspectorRouter = Router();

// POST /api/inspect - Inspect URL DOM structure for visual selector picking
inspectorRouter.post('/', async (req, res) => {
  try {
    const { url, testSelector } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'Target URL is required.' });
    }

    const ssrfCheck = await validateUrlAgainstSSRF(url);
    if (!ssrfCheck.valid) {
      return res.status(400).json({ success: false, error: `Security check: ${ssrfCheck.error}` });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const fetchRes = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 WebWatchBot/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);

    if (!fetchRes.ok) {
      return res.status(400).json({
        success: false,
        error: `Target server returned HTTP ${fetchRes.status} (${fetchRes.statusText})`,
      });
    }

    const html = await fetchRes.text();
    const $ = cheerio.load(html);

    // If testing a single specific selector
    if (testSelector && typeof testSelector === 'string') {
      try {
        const matches = $(testSelector.trim());
        const count = matches.length;
        const previews: string[] = [];
        matches.slice(0, 3).each((_, el) => {
          previews.push($(el).text().replace(/\s+/g, ' ').trim().slice(0, 150));
        });

        return res.json({
          success: true,
          data: {
            selector: testSelector,
            valid: true,
            matchesCount: count,
            previews,
          },
        });
      } catch (err: unknown) {
        return res.json({
          success: true,
          data: {
            selector: testSelector,
            valid: false,
            matchesCount: 0,
            error: err instanceof Error ? err.message : 'Invalid CSS selector syntax',
          },
        });
      }
    }

    // Otherwise extract page structure and prominent inspectable elements
    const title = $('title').text().trim() || 'Untitled Page';
    const inspectableElements: Array<{
      selector: string;
      tag: string;
      id?: string;
      className?: string;
      previewText: string;
      elementCount: number;
    }> = [];

    // Target meaningful block and content elements
    const candidateQuery = 'main, article, section, header, footer, nav, aside, table, form, h1, h2, h3, p, div, [id]';
    const seenSelectors = new Set<string>();

    $(candidateQuery).each((_, el) => {
      const $el = $(el);
      const rawTag = (el as any).name || (el as any).tagName || $el.prop('tagName') || '';
      const tag = String(rawTag).toLowerCase();
      if (!tag || tag === 'script' || tag === 'style' || tag === 'html' || tag === 'head' || tag === 'body') return;

      const id = $el.attr('id');
      const classAttr = $el.attr('class') || '';
      const firstClass = classAttr.split(/\s+/).filter(c => c && !c.includes(':'))[0];

      // Formulate unique / high-quality CSS selector
      let selector = '';
      if (id) {
        selector = `#${id}`;
      } else if (firstClass) {
        selector = `${tag}.${firstClass}`;
      } else {
        selector = tag;
      }

      if (!seenSelectors.has(selector)) {
        seenSelectors.add(selector);
        const text = $el.text().replace(/\s+/g, ' ').trim();
        if (text.length > 0) {
          inspectableElements.push({
            selector,
            tag,
            id: id || undefined,
            className: classAttr || undefined,
            previewText: text.slice(0, 140) + (text.length > 140 ? '...' : ''),
            elementCount: $(selector).length,
          });
        }
      }
    });

    res.json({
      success: true,
      data: {
        url,
        title,
        httpStatus: fetchRes.status,
        elements: inspectableElements.slice(0, 40),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});
