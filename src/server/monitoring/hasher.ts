import crypto from 'crypto';
import { SensitivityLevel } from '../../types/index.js';

/**
 * Computes a deterministic SHA-256 hash of normalized text.
 */
export function computeContentHash(normalizedContent: string): string {
  return crypto.createHash('sha256').update(normalizedContent, 'utf8').digest('hex');
}

/**
 * Evaluates whether a change between baseline and current content
 * constitutes a "meaningful change" based on sensitivity settings.
 */
export function isMeaningfulChange(
  baselineText: string,
  currentText: string,
  sensitivity: SensitivityLevel,
  visualDiffPercentage = 0
): {
  isMeaningful: boolean;
  wordChangeCount: number;
  charChangePercent: number;
  reason: string;
} {
  const baselineWords = baselineText.split(/\s+/).filter(Boolean);
  const currentWords = currentText.split(/\s+/).filter(Boolean);

  // Simple word symmetric difference count approximation
  const baselineSet = new Set(baselineWords);
  const currentSet = new Set(currentWords);

  let addedWords = 0;
  for (const w of currentWords) {
    if (!baselineSet.has(w)) addedWords++;
  }

  let removedWords = 0;
  for (const w of baselineWords) {
    if (!currentSet.has(w)) removedWords++;
  }

  const wordChangeCount = addedWords + removedWords;
  const maxLen = Math.max(baselineText.length, currentText.length, 1);
  const charDiff = Math.abs(currentText.length - baselineText.length);
  const charChangePercent = (charDiff / maxLen) * 100;

  let isMeaningful = false;
  let reason = '';

  switch (sensitivity) {
    case 'high':
      // High sensitivity: Any word addition/removal or visual diff > 0.5%
      if (wordChangeCount >= 1 || visualDiffPercentage >= 0.5) {
        isMeaningful = true;
        reason = `High sensitivity triggered: ${wordChangeCount} word change(s), visual diff ${visualDiffPercentage.toFixed(2)}%`;
      } else {
        reason = 'No noticeable change for high sensitivity';
      }
      break;

    case 'medium':
      // Medium sensitivity (default): >= 4 word changes or >= 2% length difference or visual diff >= 1.5%
      if (wordChangeCount >= 4 || charChangePercent >= 2.0 || visualDiffPercentage >= 1.5) {
        isMeaningful = true;
        reason = `Medium sensitivity threshold met: ${wordChangeCount} word changes, char delta ${charChangePercent.toFixed(1)}%, visual diff ${visualDiffPercentage.toFixed(2)}%`;
      } else {
        reason = `Changes below medium threshold (${wordChangeCount} words, ${visualDiffPercentage.toFixed(2)}% visual)`;
      }
      break;

    case 'low':
      // Low sensitivity: >= 15 word changes or >= 6% length difference or visual diff >= 4.0%
      if (wordChangeCount >= 15 || charChangePercent >= 6.0 || visualDiffPercentage >= 4.0) {
        isMeaningful = true;
        reason = `Low sensitivity threshold met: ${wordChangeCount} word changes, char delta ${charChangePercent.toFixed(1)}%, visual diff ${visualDiffPercentage.toFixed(2)}%`;
      } else {
        reason = `Minor noise ignored under low sensitivity (${wordChangeCount} words changed)`;
      }
      break;
  }

  return {
    isMeaningful,
    wordChangeCount,
    charChangePercent,
    reason,
  };
}
