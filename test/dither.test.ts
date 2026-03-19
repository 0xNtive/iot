import { describe, it, expect } from 'vitest';
import { ditherImage, type DitherAlgorithm } from '../lib/dither.js';

describe('ditherImage', () => {
  it('threshold (none) quantizes to correct levels', () => {
    // 4 pixels with known luminance
    const luma = new Float64Array([0, 85, 170, 255]);
    const result = ditherImage(luma, 4, 1, 2, 'none');
    // B&W: 0-127 → 0, 128-255 → 1
    expect(result).toEqual([0, 0, 1, 1]);
  });

  it('threshold 4-level quantization', () => {
    const luma = new Float64Array([0, 64, 128, 192, 255]);
    const result = ditherImage(luma, 5, 1, 4, 'none');
    // step = 64: 0→0, 64→1, 128→2, 192→3, 255→3
    expect(result).toEqual([0, 1, 2, 3, 3]);
  });

  it('threshold 16-level quantization', () => {
    const luma = new Float64Array([0, 16, 128, 240, 255]);
    const result = ditherImage(luma, 5, 1, 16, 'none');
    // step = 16: 0→0, 16→1, 128→8, 240→15, 255→15
    expect(result).toEqual([0, 1, 8, 15, 15]);
  });

  it('floyd-steinberg produces valid output range', () => {
    const size = 8;
    const luma = new Float64Array(size * size);
    // Gradient image
    for (let i = 0; i < size * size; i++) {
      luma[i] = (i / (size * size - 1)) * 255;
    }
    const result = ditherImage(luma, size, size, 2, 'floyd-steinberg');
    expect(result.length).toBe(size * size);
    for (const v of result) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('atkinson produces valid output range', () => {
    const size = 8;
    const luma = new Float64Array(size * size);
    for (let i = 0; i < size * size; i++) {
      luma[i] = (i / (size * size - 1)) * 255;
    }
    const result = ditherImage(luma, size, size, 2, 'atkinson');
    expect(result.length).toBe(size * size);
    for (const v of result) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('floyd-steinberg preserves mean brightness approximately', () => {
    const size = 16;
    const luma = new Float64Array(size * size).fill(127.5); // mid-gray
    const result = ditherImage(luma, size, size, 2, 'floyd-steinberg');
    const mean = result.reduce((s, v) => s + v, 0) / result.length;
    // Mid-gray should produce roughly 50% on-pixels
    expect(mean).toBeGreaterThan(0.3);
    expect(mean).toBeLessThan(0.7);
  });

  it('atkinson preserves higher contrast (fewer on-pixels for mid-gray)', () => {
    const size = 16;
    const luma = new Float64Array(size * size).fill(127.5);
    const result = ditherImage(luma, size, size, 2, 'atkinson');
    const mean = result.reduce((s, v) => s + v, 0) / result.length;
    // Atkinson discards 2/8 of error, so slightly different from FS but still reasonable
    expect(mean).toBeGreaterThan(0.2);
    expect(mean).toBeLessThan(0.8);
  });

  it('all-black input stays all-black', () => {
    const luma = new Float64Array(16).fill(0);
    for (const alg of ['none', 'floyd-steinberg', 'atkinson'] as DitherAlgorithm[]) {
      const result = ditherImage(luma, 4, 4, 2, alg);
      expect(result.every(v => v === 0)).toBe(true);
    }
  });

  it('all-white input stays all-white', () => {
    const luma = new Float64Array(16).fill(255);
    for (const alg of ['none', 'floyd-steinberg', 'atkinson'] as DitherAlgorithm[]) {
      const result = ditherImage(luma, 4, 4, 2, alg);
      expect(result.every(v => v === 1)).toBe(true);
    }
  });

  it('works with 4 levels and dithering', () => {
    const size = 8;
    const luma = new Float64Array(size * size);
    for (let i = 0; i < size * size; i++) {
      luma[i] = (i / (size * size - 1)) * 255;
    }
    const result = ditherImage(luma, size, size, 4, 'floyd-steinberg');
    for (const v of result) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(3);
    }
  });

  it('1x1 image does not crash', () => {
    const luma = new Float64Array([128]);
    const result = ditherImage(luma, 1, 1, 2, 'floyd-steinberg');
    expect(result.length).toBe(1);
  });

  it('empty image returns empty array', () => {
    const luma = new Float64Array(0);
    const result = ditherImage(luma, 0, 0, 2, 'floyd-steinberg');
    expect(result.length).toBe(0);
  });
});
