import { describe, it, expect } from 'vitest';
import { computeContentHash, isMeaningfulChange } from '../src/server/monitoring/hasher.js';

describe('Hasher & Meaningful Change Evaluator', () => {
  it('computes consistent deterministic SHA-256 hash', () => {
    const text = 'Stable content to hash';
    const hash1 = computeContentHash(text);
    const hash2 = computeContentHash(text);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects trivial single-word noise under low sensitivity', () => {
    const baseline = 'This is an example text for the web watch monitoring service.';
    const current = 'This is an updated text for the web watch monitoring service.';

    const evalResult = isMeaningfulChange(baseline, current, 'low');
    expect(evalResult.isMeaningful).toBe(false);
  });

  it('detects substantial content modifications under low sensitivity', () => {
    const baseline = 'Item cost is $10 per seat. Cancellation is allowed within 14 days.';
    const current = 'Item cost is $50 per seat. Cancellation is strictly non-refundable and all enterprise features require a 12 month prepayment commitment.';

    const evalResult = isMeaningfulChange(baseline, current, 'low');
    expect(evalResult.isMeaningful).toBe(true);
  });

  it('detects minor word change under high sensitivity', () => {
    const baseline = 'Status: Pending approval';
    const current = 'Status: Approved by committee';

    const evalResult = isMeaningfulChange(baseline, current, 'high');
    expect(evalResult.isMeaningful).toBe(true);
  });
});
