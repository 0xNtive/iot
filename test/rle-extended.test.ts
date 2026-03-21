import { describe, it, expect } from 'vitest';
import { rleEncode, rleDecode, rleEncodeGray, rleDecodeGray, quantize, dequantize, rleRatio } from '../lib/rle.js';

describe('grayscale RLE', () => {
  it('encodes a single gray value run', () => {
    const pixels = [128, 128, 128, 128, 128];
    const encoded = rleEncodeGray(pixels);
    expect(encoded.length).toBe(2); // [value, length]
    expect(encoded[0]).toBe(128);
    expect(encoded[1]).toBe(5);
  });

  it('encodes alternating gray values', () => {
    const pixels = [0, 255, 0, 255];
    const encoded = rleEncodeGray(pixels);
    expect(encoded.length).toBe(8); // 4 runs of 1 each: [v,l,v,l,v,l,v,l]
  });

  it('splits runs longer than 255', () => {
    const pixels = new Array(300).fill(42);
    const encoded = rleEncodeGray(pixels);
    expect(encoded.length).toBe(4); // two runs: [42,255] + [42,45]
    expect(encoded[0]).toBe(42);
    expect(encoded[1]).toBe(255);
    expect(encoded[2]).toBe(42);
    expect(encoded[3]).toBe(45);
  });

  it('handles empty array', () => {
    const encoded = rleEncodeGray([]);
    expect(encoded.length).toBe(0);
  });

  it('roundtrips gradient pattern', () => {
    const original = [0, 0, 0, 64, 64, 128, 128, 128, 128, 255, 255];
    const encoded = rleEncodeGray(original);
    const decoded = rleDecodeGray(encoded, original.length);
    expect(decoded).toEqual(original);
  });

  it('roundtrips large solid image', () => {
    const original = new Array(512 * 512).fill(100);
    const encoded = rleEncodeGray(original);
    // Max run length is 255, so 262144/255 ≈ 1028 runs × 2 bytes each ≈ 2058 bytes
    // Still much better than raw (262144 bytes)
    expect(encoded.length).toBeLessThan(3000);
    const decoded = rleDecodeGray(encoded, original.length);
    expect(decoded).toEqual(original);
  });

  it('roundtrips checkerboard pattern', () => {
    const size = 64;
    const original = new Array(size * size).fill(0).map((_, i) => {
      const x = i % size;
      const y = Math.floor(i / size);
      return ((x + y) % 2 === 0) ? 200 : 50;
    });
    const encoded = rleEncodeGray(original);
    const decoded = rleDecodeGray(encoded, original.length);
    expect(decoded).toEqual(original);
  });

  it('fills remaining pixels with 0 for short encoded data', () => {
    const encoded = new Uint8Array([100, 3]); // 3 pixels of value 100
    const decoded = rleDecodeGray(encoded, 5);
    expect(decoded).toEqual([100, 100, 100, 0, 0]);
  });
});

describe('quantize / dequantize', () => {
  it('quantizes to 2 levels (binary)', () => {
    const pixels = [0, 64, 127, 128, 200, 255];
    const quantized = quantize(pixels, 2);
    expect(quantized).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it('quantizes to 4 levels', () => {
    const pixels = [0, 63, 64, 127, 128, 191, 192, 255];
    const quantized = quantize(pixels, 4);
    expect(quantized).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('quantizes to 16 levels', () => {
    const quantized = quantize([0], 16);
    expect(quantized[0]).toBe(0);
    const quantized255 = quantize([255], 16);
    expect(quantized255[0]).toBe(15);
  });

  it('dequantizes back to 0-255 range', () => {
    expect(dequantize([0, 1], 2)).toEqual([0, 255]);
    expect(dequantize([0, 1, 2, 3], 4)).toEqual([0, 85, 170, 255]);
  });

  it('quantize → dequantize roundtrip preserves approximate values', () => {
    const original = [0, 85, 170, 255];
    const q = quantize(original, 4);
    const d = dequantize(q, 4);
    for (let i = 0; i < original.length; i++) {
      expect(Math.abs(d[i] - original[i])).toBeLessThanOrEqual(43); // within bucket
    }
  });

  it('handles levels < 2 (clamped to 2)', () => {
    const result = quantize([0, 128, 255], 1);
    // levels < 2 should be treated as 2
    expect(result[0]).toBe(0);
    expect(result[2]).toBe(1);
  });

  it('dequantize with levels = 1 returns all zeros', () => {
    const result = dequantize([0, 0, 0], 1);
    expect(result).toEqual([0, 0, 0]);
  });
});

describe('1-bit RLE edge cases', () => {
  it('handles single pixel false', () => {
    const encoded = rleEncode([false]);
    expect(encoded.length).toBe(1);
    const decoded = rleDecode(encoded, 1);
    expect(decoded).toEqual([false]);
  });

  it('handles single pixel true', () => {
    const encoded = rleEncode([true]);
    expect(encoded.length).toBe(1);
    const decoded = rleDecode(encoded, 1);
    expect(decoded).toEqual([true]);
  });

  it('handles exactly 127 pixels (max single run)', () => {
    const pixels = new Array(127).fill(true);
    const encoded = rleEncode(pixels);
    expect(encoded.length).toBe(1);
    expect(encoded[0]).toBe(0x80 | 127);
    const decoded = rleDecode(encoded, 127);
    expect(decoded).toEqual(pixels);
  });

  it('handles exactly 128 pixels (splits into 127 + 1)', () => {
    const pixels = new Array(128).fill(false);
    const encoded = rleEncode(pixels);
    expect(encoded.length).toBe(2);
    expect(encoded[0]).toBe(127);
    expect(encoded[1]).toBe(1);
  });

  it('roundtrips random-looking pattern', () => {
    // Pseudo-random pattern using modular arithmetic
    const original = new Array(500).fill(false).map((_, i) => (i * 7 + 3) % 11 < 5);
    const encoded = rleEncode(original);
    const decoded = rleDecode(encoded, original.length);
    expect(decoded).toEqual(original);
  });

  it('rleRatio for mixed content is between extremes', () => {
    // Blocks of 10: some compressible, some not
    const pixels = [
      ...new Array(50).fill(false),
      ...new Array(50).fill(true),
    ];
    const ratio = rleRatio(pixels);
    expect(ratio).toBeLessThan(1); // compressible
  });
});

describe('grayscale RLE with quantize integration', () => {
  it('quantize then gray RLE then decode roundtrip', () => {
    const pixels = [0, 50, 100, 150, 200, 250, 0, 50, 100, 150];
    const quantized = quantize(pixels, 4);
    const encoded = rleEncodeGray(quantized);
    const decoded = rleDecodeGray(encoded, quantized.length);
    expect(decoded).toEqual(quantized);
  });

  it('solid image quantizes and compresses extremely well', () => {
    const pixels = new Array(1000).fill(128);
    const quantized = quantize(pixels, 4);
    const encoded = rleEncodeGray(quantized);
    expect(encoded.length).toBeLessThan(10);
  });
});
