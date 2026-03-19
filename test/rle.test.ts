import { describe, it, expect } from 'vitest';
import { rleEncode, rleDecode, rleRatio } from '../lib/rle.js';

describe('rleEncode', () => {
  it('encodes a single run of off pixels', () => {
    const pixels = new Array(10).fill(false);
    const encoded = rleEncode(pixels);
    expect(encoded.length).toBe(1);
    expect(encoded[0]).toBe(10); // 0x0A = 10 off pixels
  });

  it('encodes a single run of on pixels', () => {
    const pixels = new Array(5).fill(true);
    const encoded = rleEncode(pixels);
    expect(encoded.length).toBe(1);
    expect(encoded[0]).toBe(0x80 | 5); // color bit + 5
  });

  it('encodes alternating runs', () => {
    const pixels = [false, false, false, true, true, false];
    const encoded = rleEncode(pixels);
    expect(encoded.length).toBe(3);
    expect(encoded[0]).toBe(3);        // 3 off
    expect(encoded[1]).toBe(0x80 | 2); // 2 on
    expect(encoded[2]).toBe(1);        // 1 off
  });

  it('splits runs longer than 127', () => {
    const pixels = new Array(200).fill(true);
    const encoded = rleEncode(pixels);
    expect(encoded.length).toBe(2);
    expect(encoded[0]).toBe(0x80 | 127); // 127 on
    expect(encoded[1]).toBe(0x80 | 73);  // 73 on
  });

  it('handles empty array', () => {
    const encoded = rleEncode([]);
    expect(encoded.length).toBe(0);
  });
});

describe('rleDecode', () => {
  it('decodes a single run', () => {
    const encoded = new Uint8Array([5]); // 5 off pixels
    const decoded = rleDecode(encoded, 5);
    expect(decoded).toEqual([false, false, false, false, false]);
  });

  it('fills remaining pixels with false for partial data', () => {
    const encoded = new Uint8Array([3]); // 3 off pixels
    const decoded = rleDecode(encoded, 5);
    expect(decoded).toEqual([false, false, false, false, false]);
  });
});

describe('roundtrip', () => {
  it('roundtrips alternating pattern', () => {
    const original = [true, false, true, false, true, false, true, false];
    const encoded = rleEncode(original);
    const decoded = rleDecode(encoded, original.length);
    expect(decoded).toEqual(original);
  });

  it('roundtrips large solid regions', () => {
    const original = [
      ...new Array(100).fill(false),
      ...new Array(50).fill(true),
      ...new Array(100).fill(false),
    ];
    const encoded = rleEncode(original);
    expect(encoded.length).toBe(3); // huge compression
    const decoded = rleDecode(encoded, original.length);
    expect(decoded).toEqual(original);
  });

  it('roundtrips 512x512 sparse image', () => {
    const size = 512 * 512;
    const original = new Array(size).fill(false);
    // Draw a diagonal line
    for (let i = 0; i < 512; i++) {
      original[i * 512 + i] = true;
    }
    const encoded = rleEncode(original);
    // Should compress massively (mostly off with tiny on runs)
    expect(encoded.length).toBeLessThan(size / 8); // better than raw
    const decoded = rleDecode(encoded, size);
    expect(decoded).toEqual(original);
  });
});

describe('rleRatio', () => {
  it('returns < 1 for compressible data', () => {
    const pixels = new Array(1024).fill(false);
    expect(rleRatio(pixels)).toBeLessThan(0.1);
  });

  it('returns > 1 for incompressible data', () => {
    // Worst case: alternating pixels
    const pixels = new Array(100).fill(false).map((_, i) => i % 2 === 0);
    expect(rleRatio(pixels)).toBeGreaterThan(1);
  });
});
