/**
 * Palette-indexed image encoding with row-run compression.
 *
 * Instead of sending pixels row-by-row, we flip it:
 * 1. Quantize image to N colors (up to 16)
 * 2. For each color (most frequent first):
 *    - Encode all row positions where this color appears as horizontal runs
 *    - (row, numRuns, [startCol, length]...)
 * 3. Sparse colors compress to almost nothing
 *
 * This is like announcing "color #3 appears at these spots" for each color.
 */

export interface RGB { r: number; g: number; b: number }

export interface PaletteImage {
  width: number;
  height: number;
  palette: RGB[];          // sorted by frequency (most common first)
  indices: Uint8Array;     // palette index per pixel (row-major)
}

// === Color Quantization (Median Cut) ===

export function quantizeColors(
  pixels: Uint8Array, // RGBA flat array (4 bytes per pixel)
  width: number,
  height: number,
  maxColors: number,
): PaletteImage {
  const count = width * height;

  // Collect unique-ish colors (downsample to 5 bits per channel for speed)
  const colorMap = new Map<number, { r: number; g: number; b: number; count: number }>();
  for (let i = 0; i < count; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    // Quantize to 5 bits for grouping
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const existing = colorMap.get(key);
    if (existing) {
      existing.r += r;
      existing.g += g;
      existing.b += b;
      existing.count++;
    } else {
      colorMap.set(key, { r, g, b, count: 1 });
    }
  }

  // Build color list for median cut
  const colors: { r: number; g: number; b: number; count: number }[] = [];
  for (const entry of colorMap.values()) {
    colors.push({
      r: Math.round(entry.r / entry.count),
      g: Math.round(entry.g / entry.count),
      b: Math.round(entry.b / entry.count),
      count: entry.count,
    });
  }

  // Median cut
  const palette = medianCut(colors, maxColors);

  // Sort palette by frequency (most common first)
  const paletteCounts = new Array(palette.length).fill(0);
  const indices = new Uint8Array(count);

  for (let i = 0; i < count; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    const idx = nearestColor(r, g, b, palette);
    indices[i] = idx;
    paletteCounts[idx]++;
  }

  // Re-sort palette by frequency
  const order = palette.map((_, i) => i).sort((a, b) => paletteCounts[b] - paletteCounts[a]);
  const sortedPalette = order.map(i => palette[i]);
  const reindex = new Uint8Array(palette.length);
  order.forEach((oldIdx, newIdx) => { reindex[oldIdx] = newIdx; });
  for (let i = 0; i < count; i++) {
    indices[i] = reindex[indices[i]];
  }

  return { width, height, palette: sortedPalette, indices };
}

function medianCut(
  colors: { r: number; g: number; b: number; count: number }[],
  maxColors: number,
): RGB[] {
  if (colors.length <= maxColors) {
    return colors.map(c => ({ r: c.r, g: c.g, b: c.b }));
  }

  let buckets: typeof colors[] = [colors];

  while (buckets.length < maxColors) {
    // Find bucket with widest range
    let bestIdx = 0;
    let bestRange = -1;

    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].length <= 1) continue;
      const range = channelRange(buckets[i]);
      if (range.maxRange > bestRange) {
        bestRange = range.maxRange;
        bestIdx = i;
      }
    }

    if (bestRange <= 0) break;

    const bucket = buckets[bestIdx];
    const range = channelRange(bucket);

    // Sort by widest channel and split at median
    bucket.sort((a, b) => {
      const av = range.channel === 0 ? a.r : range.channel === 1 ? a.g : a.b;
      const bv = range.channel === 0 ? b.r : range.channel === 1 ? b.g : b.b;
      return av - bv;
    });

    const mid = Math.floor(bucket.length / 2);
    buckets.splice(bestIdx, 1, bucket.slice(0, mid), bucket.slice(mid));
  }

  // Average each bucket to get palette color
  return buckets.map(bucket => {
    let tr = 0, tg = 0, tb = 0, tw = 0;
    for (const c of bucket) {
      tr += c.r * c.count;
      tg += c.g * c.count;
      tb += c.b * c.count;
      tw += c.count;
    }
    return {
      r: Math.round(tr / tw),
      g: Math.round(tg / tw),
      b: Math.round(tb / tw),
    };
  });
}

function channelRange(colors: { r: number; g: number; b: number }[]): {
  channel: number; maxRange: number;
} {
  let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
  for (const c of colors) {
    if (c.r < minR) minR = c.r; if (c.r > maxR) maxR = c.r;
    if (c.g < minG) minG = c.g; if (c.g > maxG) maxG = c.g;
    if (c.b < minB) minB = c.b; if (c.b > maxB) maxB = c.b;
  }
  const rr = maxR - minR, gr = maxG - minG, br = maxB - minB;
  if (rr >= gr && rr >= br) return { channel: 0, maxRange: rr };
  if (gr >= br) return { channel: 1, maxRange: gr };
  return { channel: 2, maxRange: br };
}

function nearestColor(r: number, g: number, b: number, palette: RGB[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const dr = r - palette[i].r;
    const dg = g - palette[i].g;
    const db = b - palette[i].b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

// === Row-Run Encoding ===

/**
 * Encode a palette image as row-run data.
 *
 * Format:
 *   1 byte:   numColors (N)
 *   N*3 bytes: RGB palette
 *   For each color (0 to N-1):
 *     2 bytes: block length (big-endian)
 *     Row-run data:
 *       For each row containing this color:
 *         1 byte: row number
 *         1 byte: number of runs
 *         runs*2 bytes: (startCol, length) pairs
 */
export function encodePaletteImage(img: PaletteImage): Uint8Array {
  const { width, height, palette, indices } = img;
  const parts: number[] = [];

  // Header
  parts.push(palette.length);
  for (const c of palette) {
    parts.push(c.r, c.g, c.b);
  }

  // Per-color row-runs
  for (let colorIdx = 0; colorIdx < palette.length; colorIdx++) {
    const blockData: number[] = [];

    for (let row = 0; row < height; row++) {
      const runs: [number, number][] = [];
      let col = 0;

      while (col < width) {
        // Find next run of this color in this row
        while (col < width && indices[row * width + col] !== colorIdx) col++;
        if (col >= width) break;

        const startCol = col;
        while (col < width && indices[row * width + col] === colorIdx) col++;
        runs.push([startCol, col - startCol]);
      }

      if (runs.length > 0) {
        blockData.push(row);
        blockData.push(runs.length);
        for (const [s, l] of runs) {
          blockData.push(s, l);
        }
      }
    }

    // Write block length + data
    parts.push((blockData.length >> 8) & 0xff);
    parts.push(blockData.length & 0xff);
    parts.push(...blockData);
  }

  return new Uint8Array(parts);
}

/**
 * Decode palette row-run data into a pixel array of RGB values.
 */
/**
 * Decode palette row-run data into a pixel array of RGB values.
 */
export function decodePaletteImage(
  data: Uint8Array,
  width: number,
  height: number,
): { palette: RGB[]; indices: number[] } {
  let offset = 0;

  const numColors = data[offset++];
  const palette: RGB[] = [];
  for (let i = 0; i < numColors; i++) {
    palette.push({
      r: data[offset++] ?? 0,
      g: data[offset++] ?? 0,
      b: data[offset++] ?? 0,
    });
  }

  // Start with all pixels as color 0 (most frequent = background)
  const indices = new Array(width * height).fill(0);

  for (let colorIdx = 0; colorIdx < numColors && offset + 1 < data.length; colorIdx++) {
    const blockLen = (data[offset] << 8) | data[offset + 1];
    offset += 2;

    const blockEnd = Math.min(offset + blockLen, data.length);
    while (offset < blockEnd) {
      const row = data[offset++];
      if (offset >= blockEnd) break;
      const numRuns = data[offset++];

      for (let r = 0; r < numRuns && offset + 1 < blockEnd; r++) {
        const startCol = data[offset++];
        const length = data[offset++];
        for (let c = startCol; c < startCol + length && c < width; c++) {
          if (row < height) {
            indices[row * width + c] = colorIdx;
          }
        }
      }
    }
  }

  return { palette, indices };
}
