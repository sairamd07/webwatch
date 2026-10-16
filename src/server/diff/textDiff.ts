import * as Diff from 'diff';

export interface TextDiffOutput {
  addedWords: number;
  removedWords: number;
  totalWords: number;
  changePercentage: number;
  lines: Array<{
    type: 'added' | 'removed' | 'unchanged';
    value: string;
  }>;
  summary: string;
}

export function computeTextDiff(baseline: string, current: string): TextDiffOutput {
  const lineDiff = Diff.diffLines(baseline, current);
  const wordDiff = Diff.diffWords(baseline, current);

  let addedWords = 0;
  let removedWords = 0;

  for (const part of wordDiff) {
    const wordCount = part.value.split(/\s+/).filter(Boolean).length;
    if (part.added) {
      addedWords += wordCount;
    } else if (part.removed) {
      removedWords += wordCount;
    }
  }

  const baselineWords = baseline.split(/\s+/).filter(Boolean).length;
  const totalWords = Math.max(baselineWords, 1);
  const changePercentage = Math.min(100, Number(((addedWords + removedWords) / totalWords * 100).toFixed(2)));

  const lines: Array<{ type: 'added' | 'removed' | 'unchanged'; value: string }> = [];

  for (const part of lineDiff) {
    const rawLines = part.value.split('\n');
    // Don't create trailing empty line if string ended with \n
    if (rawLines[rawLines.length - 1] === '') {
      rawLines.pop();
    }

    const type = part.added ? 'added' : part.removed ? 'removed' : 'unchanged';
    for (const line of rawLines) {
      lines.push({ type, value: line });
    }
  }

  let summary = 'No textual changes detected.';
  if (addedWords > 0 || removedWords > 0) {
    summary = `Detected ${addedWords} word(s) added, ${removedWords} word(s) removed (${changePercentage}% delta).`;
  }

  return {
    addedWords,
    removedWords,
    totalWords,
    changePercentage,
    lines,
    summary,
  };
}
