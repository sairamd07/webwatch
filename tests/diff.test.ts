import { describe, it, expect } from 'vitest';
import { computeTextDiff } from '../src/server/diff/textDiff.js';

describe('Myers Text Diff Engine', () => {
  it('correctly calculates added and removed words and lines', () => {
    const baseline = 'Welcome to our platform.\nThe standard price is $20 per month.\nIncludes 5 projects.';
    const current = 'Welcome to our platform.\nThe standard price is $29 per month.\nIncludes 10 projects.\nBonus phone support.';

    const diff = computeTextDiff(baseline, current);

    expect(diff.addedWords).toBeGreaterThan(0);
    expect(diff.lines.some(l => l.type === 'added')).toBe(true);
    expect(diff.lines.some(l => l.type === 'removed')).toBe(true);
    expect(diff.lines.some(l => l.type === 'unchanged')).toBe(true);
    expect(diff.summary).toContain('Detected');
  });

  it('handles identical content cleanly', () => {
    const text = 'Identical content across runs.';
    const diff = computeTextDiff(text, text);

    expect(diff.addedWords).toBe(0);
    expect(diff.removedWords).toBe(0);
    expect(diff.changePercentage).toBe(0);
    expect(diff.summary).toContain('No textual changes detected');
  });
});
