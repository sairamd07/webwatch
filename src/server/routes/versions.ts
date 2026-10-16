import { Router } from 'express';
import { db } from '../db/index.js';
import { computeTextDiff } from '../diff/textDiff.js';
import { computeScreenshotDiff } from '../diff/imageDiff.js';
import { DiffResult } from '../../types/index.js';

export const versionsRouter = Router();

// GET /api/pages/:id/snapshots - List all snapshots for a page
versionsRouter.get('/:id/snapshots', async (req, res) => {
  try {
    const snapshots = await db.getSnapshots(req.params.id);
    res.json({ success: true, data: snapshots });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/pages/:id/compare - Compare two snapshot versions
// Query params: v1 (older version id), v2 (newer version id)
versionsRouter.get('/:id/compare', async (req, res) => {
  try {
    const pageId = req.params.id;
    const { v1, v2 } = req.query;

    if (!v1 || !v2) {
      return res.status(400).json({
        success: false,
        error: 'Both v1 and v2 snapshot query parameters are required for comparison.',
      });
    }

    const snap1 = await db.getSnapshotById(String(v1));
    const snap2 = await db.getSnapshotById(String(v2));

    if (!snap1 || !snap2) {
      return res.status(404).json({
        success: false,
        error: 'One or both snapshot versions could not be found.',
      });
    }

    // Compute text differences
    const textDiffOutput = computeTextDiff(snap1.normalizedText, snap2.normalizedText);

    // Compute visual differences if screenshots exist
    let visualDiff;
    if (snap1.screenshotPath && snap2.screenshotPath) {
      const imgDiff = await computeScreenshotDiff(snap1.screenshotPath, snap2.screenshotPath, pageId);
      visualDiff = {
        diffPercentage: imgDiff.diffPercentage,
        diffImageUrl: imgDiff.diffImageUrl,
        baselineImageUrl: snap1.screenshotUrl,
        currentImageUrl: snap2.screenshotUrl,
      };
    }

    const diffResult: DiffResult = {
      hasMeaningfulChange: snap1.contentHash !== snap2.contentHash,
      changePercentage: textDiffOutput.changePercentage,
      textDiff: {
        addedWords: textDiffOutput.addedWords,
        removedWords: textDiffOutput.removedWords,
        lines: textDiffOutput.lines,
      },
      visualDiff,
      summary: textDiffOutput.summary,
    };

    res.json({
      success: true,
      data: {
        pageId,
        baselineVersion: snap1,
        comparedVersion: snap2,
        diff: diffResult,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});
