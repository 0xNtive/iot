import { describe, it, expect } from 'vitest';
import { encodeBlocks, FountainDecoder } from '../lib/fountain.js';

describe('encodeBlocks', () => {
  it('produces systematic + parity blocks', () => {
    const data = new Uint8Array(100);
    for (let i = 0; i < 100; i++) data[i] = i;

    const blocks = encodeBlocks(data, 25, 0.5);
    // K=4 source blocks + ceil(4*0.5)=2 parity blocks = 6 total
    expect(blocks.length).toBe(6);

    // First 4 are systematic (degree=1)
    for (let i = 0; i < 4; i++) {
      expect(blocks[i].degree).toBe(1);
      expect(blocks[i].sourceIndices).toEqual([i]);
      expect(blocks[i].payload.length).toBe(25);
    }

    // Last 2 are parity (degree >= 2)
    for (let i = 4; i < 6; i++) {
      expect(blocks[i].degree).toBeGreaterThanOrEqual(2);
      expect(blocks[i].sourceIndices.length).toBe(blocks[i].degree);
    }
  });

  it('handles data smaller than one block', () => {
    const data = new Uint8Array([1, 2, 3]);
    const blocks = encodeBlocks(data, 130);
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    expect(blocks[0].degree).toBe(1);
    expect(blocks[0].payload[0]).toBe(1);
    expect(blocks[0].payload[1]).toBe(2);
    expect(blocks[0].payload[2]).toBe(3);
  });

  it('returns empty for empty data', () => {
    expect(encodeBlocks(new Uint8Array(0), 130)).toEqual([]);
  });

  it('zero-pads the last block', () => {
    const data = new Uint8Array([10, 20, 30]);
    const blocks = encodeBlocks(data, 10);
    // 1 block of size 10, with only first 3 bytes filled
    expect(blocks[0].payload.length).toBe(10);
    expect(blocks[0].payload[3]).toBe(0);
  });
});

describe('FountainDecoder', () => {
  it('decodes all systematic blocks (no loss)', () => {
    const data = new Uint8Array(100);
    for (let i = 0; i < 100; i++) data[i] = i;

    const blocks = encodeBlocks(data, 25, 0.5);
    const decoder = new FountainDecoder(4, 25, 100);

    // Feed just the 4 systematic blocks
    for (let i = 0; i < 4; i++) {
      const done = decoder.addBlock(blocks[i]);
      if (i < 3) expect(done).toBe(false);
      else expect(done).toBe(true);
    }

    expect(decoder.isComplete()).toBe(true);
    expect(decoder.getProgress()).toBe(1);
    expect(Array.from(decoder.getDecoded())).toEqual(Array.from(data));
  });

  it('recovers from one lost systematic block using parity', () => {
    const data = new Uint8Array(100);
    for (let i = 0; i < 100; i++) data[i] = i;

    const blocks = encodeBlocks(data, 25, 0.5);
    const decoder = new FountainDecoder(4, 25, 100);

    // Skip block 1 (simulate loss), feed blocks 0, 2, 3
    decoder.addBlock(blocks[0]);
    decoder.addBlock(blocks[2]);
    decoder.addBlock(blocks[3]);
    expect(decoder.isComplete()).toBe(false);
    expect(decoder.getMissing()).toBe(1);

    // Feed parity blocks until recovered
    for (let i = 4; i < blocks.length; i++) {
      if (decoder.addBlock(blocks[i])) break;
    }

    expect(decoder.isComplete()).toBe(true);
    expect(Array.from(decoder.getDecoded())).toEqual(Array.from(data));
  });

  it('tracks progress correctly', () => {
    const data = new Uint8Array(80);
    const blocks = encodeBlocks(data, 20, 0.5);
    const decoder = new FountainDecoder(4, 20, 80);

    decoder.addBlock(blocks[0]);
    expect(decoder.getProgress()).toBe(0.25);
    decoder.addBlock(blocks[1]);
    expect(decoder.getProgress()).toBe(0.5);
  });

  it('handles duplicate blocks gracefully', () => {
    const data = new Uint8Array(50);
    for (let i = 0; i < 50; i++) data[i] = i;

    const blocks = encodeBlocks(data, 25, 0.5);
    const decoder = new FountainDecoder(2, 25, 50);

    decoder.addBlock(blocks[0]);
    decoder.addBlock(blocks[0]); // duplicate
    expect(decoder.getProgress()).toBe(0.5);

    decoder.addBlock(blocks[1]);
    expect(decoder.isComplete()).toBe(true);
    expect(Array.from(decoder.getDecoded())).toEqual(Array.from(data));
  });

  it('handles single-block data', () => {
    const data = new Uint8Array([42, 43, 44]);
    const blocks = encodeBlocks(data, 130, 0.5);
    const decoder = new FountainDecoder(1, 130, 3);

    decoder.addBlock(blocks[0]);
    expect(decoder.isComplete()).toBe(true);
    const result = decoder.getDecoded();
    expect(result.length).toBe(3);
    expect(Array.from(result)).toEqual([42, 43, 44]);
  });

  it('full encode-decode roundtrip with realistic sizes', () => {
    // Simulate a small file (~500 bytes)
    const data = new Uint8Array(500);
    for (let i = 0; i < 500; i++) data[i] = i & 0xFF;

    const blockSize = 130;
    const blocks = encodeBlocks(data, blockSize, 0.5);
    const k = Math.ceil(500 / blockSize); // 4
    const decoder = new FountainDecoder(k, blockSize, 500);

    for (const block of blocks) {
      if (decoder.addBlock(block)) break;
    }

    expect(decoder.isComplete()).toBe(true);
    expect(Array.from(decoder.getDecoded())).toEqual(Array.from(data));
  });
});
