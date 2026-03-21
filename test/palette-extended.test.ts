import { describe, it, expect } from 'vitest';
import { quantizeColors, encodePaletteImage, decodePaletteImage, type PaletteImage } from '../lib/palette.js';

describe('quantizeColors advanced', () => {
  it('quantizes gradient to requested color count', () => {
    const size = 32;
    const rgba = new Uint8Array(size * size * 4);
    // Create a smooth gradient (many unique colors)
    for (let i = 0; i < size * size; i++) {
      const v = Math.floor((i / (size * size)) * 255);
      rgba[i * 4] = v;
      rgba[i * 4 + 1] = v;
      rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }

    const result = quantizeColors(rgba, size, size, 4);
    expect(result.palette.length).toBeLessThanOrEqual(4);
    expect(result.indices.length).toBe(size * size);
  });

  it('sorts palette by frequency (most common first)', () => {
    const size = 4;
    const rgba = new Uint8Array(size * size * 4);
    // 12 red pixels, 4 blue pixels
    for (let i = 0; i < 16; i++) {
      const isRed = i < 12;
      rgba[i * 4] = isRed ? 255 : 0;
      rgba[i * 4 + 1] = 0;
      rgba[i * 4 + 2] = isRed ? 0 : 255;
      rgba[i * 4 + 3] = 255;
    }

    const result = quantizeColors(rgba, size, size, 16);
    // Red should be first (most frequent)
    expect(result.palette[0].r).toBeGreaterThan(200);
    expect(result.palette[0].b).toBeLessThan(50);
  });

  it('handles single pixel image', () => {
    const rgba = new Uint8Array([128, 64, 32, 255]);
    const result = quantizeColors(rgba, 1, 1, 16);
    expect(result.palette.length).toBeGreaterThanOrEqual(1);
    expect(result.indices.length).toBe(1);
    expect(result.indices[0]).toBe(0);
  });

  it('handles 3 distinct colors', () => {
    const rgba = new Uint8Array(3 * 4);
    rgba.set([255, 0, 0, 255], 0);   // red
    rgba.set([0, 255, 0, 255], 4);   // green
    rgba.set([0, 0, 255, 255], 8);   // blue

    const result = quantizeColors(rgba, 3, 1, 16);
    expect(result.palette.length).toBe(3);
    expect(result.indices.length).toBe(3);
    // Each pixel should have a unique index
    const uniqueIndices = new Set(Array.from(result.indices));
    expect(uniqueIndices.size).toBe(3);
  });

  it('maxColors limits palette size', () => {
    const size = 16;
    const rgba = new Uint8Array(size * size * 4);
    // Create many colors (rainbow-ish)
    for (let i = 0; i < size * size; i++) {
      rgba[i * 4] = (i * 37) % 256;
      rgba[i * 4 + 1] = (i * 73) % 256;
      rgba[i * 4 + 2] = (i * 113) % 256;
      rgba[i * 4 + 3] = 255;
    }

    const result = quantizeColors(rgba, size, size, 8);
    expect(result.palette.length).toBeLessThanOrEqual(8);
  });
});

describe('encodePaletteImage / decodePaletteImage', () => {
  it('roundtrips a 3-color striped image', () => {
    const width = 12;
    const height = 4;
    const palette = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
    ];
    // Vertical stripes: 4 columns each
    const indices = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        indices[y * width + x] = Math.floor(x / 4);
      }
    }

    const img: PaletteImage = { width, height, palette, indices };
    const encoded = encodePaletteImage(img);
    const decoded = decodePaletteImage(encoded, width, height);

    expect(decoded.palette).toEqual(palette);
    expect(decoded.indices).toEqual(Array.from(indices));
  });

  it('roundtrips a single-color image', () => {
    const width = 8;
    const height = 8;
    const palette = [{ r: 100, g: 200, b: 50 }];
    const indices = new Uint8Array(64).fill(0);

    const img: PaletteImage = { width, height, palette, indices };
    const encoded = encodePaletteImage(img);
    const decoded = decodePaletteImage(encoded, width, height);

    expect(decoded.palette.length).toBe(1);
    expect(decoded.indices.every((v: number) => v === 0)).toBe(true);
  });

  it('roundtrips a checkerboard 2-color pattern', () => {
    const width = 8;
    const height = 8;
    const palette = [
      { r: 255, g: 255, b: 255 },
      { r: 0, g: 0, b: 0 },
    ];
    const indices = new Uint8Array(64);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        indices[y * width + x] = (x + y) % 2;
      }
    }

    const img: PaletteImage = { width, height, palette, indices };
    const encoded = encodePaletteImage(img);
    const decoded = decodePaletteImage(encoded, width, height);

    expect(decoded.indices).toEqual(Array.from(indices));
  });

  it('palette encoding is compact for solid regions', () => {
    const width = 64;
    const height = 64;
    const palette = [{ r: 255, g: 0, b: 0 }];
    const indices = new Uint8Array(width * height).fill(0);

    const img: PaletteImage = { width, height, palette, indices };
    const encoded = encodePaletteImage(img);
    // Header: 1 (numColors) + 3 (RGB) + 2 (blockLen) + row data
    // For solid: 64 rows × (1 row + 1 numRuns + 2 startCol+length) = 256 bytes + overhead
    expect(encoded.length).toBeLessThan(500);
  });

  it('handles max 16 colors', () => {
    const width = 16;
    const height = 1;
    const palette = Array.from({ length: 16 }, (_, i) => ({
      r: i * 16, g: i * 8, b: i * 4,
    }));
    const indices = new Uint8Array(16);
    for (let i = 0; i < 16; i++) indices[i] = i;

    const img: PaletteImage = { width, height, palette, indices };
    const encoded = encodePaletteImage(img);
    const decoded = decodePaletteImage(encoded, width, height);

    expect(decoded.palette.length).toBe(16);
    expect(decoded.indices).toEqual(Array.from(indices));
  });

  it('handles sparse color (appears in very few pixels)', () => {
    const width = 8;
    const height = 8;
    const palette = [
      { r: 255, g: 255, b: 255 }, // dominant
      { r: 255, g: 0, b: 0 },     // sparse
    ];
    const indices = new Uint8Array(64).fill(0);
    indices[0] = 1; // only 1 pixel of color 1

    const img: PaletteImage = { width, height, palette, indices };
    const encoded = encodePaletteImage(img);
    const decoded = decodePaletteImage(encoded, width, height);

    expect(decoded.indices[0]).toBe(1);
    for (let i = 1; i < 64; i++) {
      expect(decoded.indices[i]).toBe(0);
    }
  });
});

describe('full pipeline: quantize → encode → decode', () => {
  it('four-quadrant color image roundtrips through encode/decode', () => {
    const size = 16;
    const rgba = new Uint8Array(size * size * 4);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const i = row * size + col;
        const isTop = row < 8;
        const isLeft = col < 8;
        rgba[i * 4] = isTop ? 255 : 0;
        rgba[i * 4 + 1] = isLeft ? 255 : 0;
        rgba[i * 4 + 2] = (!isTop && !isLeft) ? 255 : 0;
        rgba[i * 4 + 3] = 255;
      }
    }

    const palImg = quantizeColors(rgba, size, size, 16);
    const encoded = encodePaletteImage(palImg);
    const decoded = decodePaletteImage(encoded, size, size);

    // All pixels in each quadrant should have the same index
    const tl = decoded.indices[0];           // top-left
    const tr = decoded.indices[8];           // top-right
    const bl = decoded.indices[8 * 16];      // bottom-left
    const br = decoded.indices[8 * 16 + 8];  // bottom-right

    expect(new Set([tl, tr, bl, br]).size).toBeGreaterThanOrEqual(3);
  });
});
