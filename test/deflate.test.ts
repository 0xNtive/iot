import { describe, it, expect } from 'vitest';
import { deflateCompress, deflateDecompress, isCompressionAvailable } from '../lib/deflate.js';

describe('deflate compression', () => {
  it('isCompressionAvailable returns a boolean', () => {
    const result = isCompressionAvailable();
    expect(typeof result).toBe('boolean');
  });

  it('compress returns a Uint8Array', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const compressed = await deflateCompress(data);
    expect(compressed).toBeInstanceOf(Uint8Array);
    expect(compressed.length).toBeGreaterThan(0);
  });

  it('compress → decompress roundtrip preserves data', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const compressed = await deflateCompress(data);
    const decompressed = await deflateDecompress(compressed);
    expect(Array.from(decompressed)).toEqual(Array.from(data));
  });

  it('handles empty data roundtrip', async () => {
    const data = new Uint8Array(0);
    const compressed = await deflateCompress(data);
    const decompressed = await deflateDecompress(compressed);
    expect(decompressed.length).toBe(0);
  });

  it('handles large data roundtrip', async () => {
    const data = new Uint8Array(10000);
    for (let i = 0; i < 10000; i++) data[i] = i & 0xFF;
    const compressed = await deflateCompress(data);
    const decompressed = await deflateDecompress(compressed);
    expect(Array.from(decompressed)).toEqual(Array.from(data));
  });

  it('compresses repetitive data effectively', async () => {
    if (!isCompressionAvailable()) return; // skip if no compression
    const data = new Uint8Array(1000).fill(42);
    const compressed = await deflateCompress(data);
    expect(compressed.length).toBeLessThan(data.length);
  });

  it('roundtrips binary data with all byte values', async () => {
    const data = new Uint8Array(256);
    for (let i = 0; i < 256; i++) data[i] = i;
    const compressed = await deflateCompress(data);
    const decompressed = await deflateDecompress(compressed);
    expect(Array.from(decompressed)).toEqual(Array.from(data));
  });
});
