import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { config } from '../config.js';

export interface VisualDiffOutput {
  diffPercentage: number;
  diffImageUrl?: string;
  diffImagePath?: string;
  baselineImageUrl?: string;
  currentImageUrl?: string;
  totalPixels: number;
  diffPixels: number;
}

/**
 * Compares two PNG screenshots pixel-by-pixel using pixelmatch.
 * Produces a highlighted visual diff image.
 */
export async function computeScreenshotDiff(
  baselinePath: string,
  currentPath: string,
  pageId: string
): Promise<VisualDiffOutput> {
  try {
    const [baselineBuffer, currentBuffer] = await Promise.all([
      fs.readFile(baselinePath),
      fs.readFile(currentPath),
    ]);

    const img1 = PNG.sync.read(baselineBuffer);
    const img2 = PNG.sync.read(currentBuffer);

    // Normalize dimensions to the max width and height
    const width = Math.max(img1.width, img2.width);
    const height = Math.max(img1.height, img2.height);

    const canvas1 = new PNG({ width, height });
    const canvas2 = new PNG({ width, height });
    const diffCanvas = new PNG({ width, height });

    PNG.bitblt(img1, canvas1, 0, 0, img1.width, img1.height, 0, 0);
    PNG.bitblt(img2, canvas2, 0, 0, img2.width, img2.height, 0, 0);

    const diffPixels = pixelmatch(
      canvas1.data,
      canvas2.data,
      diffCanvas.data,
      width,
      height,
      {
        threshold: 0.15, // Sensitivity threshold
        diffColor: [239, 68, 68], // Bright red highlight #ef4444
        aaColor: [249, 115, 22],   // Orange for anti-aliasing
      }
    );

    const totalPixels = width * height;
    const diffPercentage = Math.min(100, Number(((diffPixels / totalPixels) * 100).toFixed(2)));

    // Save visual diff image
    const diffFilename = `diff-${pageId}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.png`;
    const diffFilePath = path.join(config.screenshotsDir, diffFilename);
    const diffBuffer = PNG.sync.write(diffCanvas);
    await fs.writeFile(diffFilePath, diffBuffer);

    return {
      diffPercentage,
      diffImageUrl: `/api/storage/screenshots/${diffFilename}`,
      diffImagePath: diffFilePath,
      totalPixels,
      diffPixels,
    };
  } catch (err: unknown) {
    // If files are missing or unreadable
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[VisualDiff] Pixel comparison error: ${message}`);
    return {
      diffPercentage: 0,
      totalPixels: 0,
      diffPixels: 0,
    };
  }
}
