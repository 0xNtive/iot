import { describe, it, expect } from 'vitest';
import { encodeBlocks, FountainDecoder } from '../lib/fountain.js';

describe('fountain code packet loss simulation', () => {
  it('recovers from 2 lost systematic blocks', () => {
    const data = new Uint8Array(200);
    for (let i = 0; i < 200; i++) data[i] = (i * 3 + 7) & 0xFF;

    const blockSize = 25;
    const blocks = encodeBlocks(data, blockSize, 1.0); // 100% redundancy for more parity
    const k = Math.ceil(200 / blockSize); // 8

    const decoder = new FountainDecoder(k, blockSize, 200);

    // Skip blocks 2 and 5
    for (const block of blocks) {
      if (block.index === 2 || block.index === 5) continue;
      decoder.addBlock(block);
      if (decoder.isComplete()) break;
    }

    expect(decoder.isComplete()).toBe(true);
    expect(Array.from(decoder.getDecoded())).toEqual(Array.from(data));
  });

  it('recovers when receiving only parity + some systematic blocks', () => {
    const data = new Uint8Array(100);
    for (let i = 0; i < 100; i++) data[i] = i;

    const blocks = encodeBlocks(data, 25, 1.0);
    const k = 4;
    const decoder = new FountainDecoder(k, 25, 100);

    // Only feed blocks 0, 3, and all parity
    decoder.addBlock(blocks[0]); // systematic 0
    decoder.addBlock(blocks[3]); // systematic 3
    for (let i = k; i < blocks.length; i++) {
      decoder.addBlock(blocks[i]);
      if (decoder.isComplete()) break;
    }

    expect(decoder.isComplete()).toBe(true);
    expect(Array.from(decoder.getDecoded())).toEqual(Array.from(data));
  });

  it('handles out-of-order block delivery', () => {
    const data = new Uint8Array(100);
    for (let i = 0; i < 100; i++) data[i] = i;

    const blocks = encodeBlocks(data, 25, 0.5);
    const decoder = new FountainDecoder(4, 25, 100);

    // Feed in reverse order
    for (let i = blocks.length - 1; i >= 0; i--) {
      decoder.addBlock(blocks[i]);
      if (decoder.isComplete()) break;
    }

    expect(decoder.isComplete()).toBe(true);
    expect(Array.from(decoder.getDecoded())).toEqual(Array.from(data));
  });
});

describe('encoder properties', () => {
  it('systematic blocks are exact copies of source', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const blocks = encodeBlocks(data, 5, 0.5);

    // First block should contain bytes 1-5
    expect(Array.from(blocks[0].payload.subarray(0, 5))).toEqual([1, 2, 3, 4, 5]);
    // Second block should contain bytes 6-10
    expect(Array.from(blocks[1].payload.subarray(0, 5))).toEqual([6, 7, 8, 9, 10]);
  });

  it('parity blocks are XOR of their source blocks', () => {
    const data = new Uint8Array(20);
    for (let i = 0; i < 20; i++) data[i] = i + 1;

    const blocks = encodeBlocks(data, 10, 0.5);
    const k = 2;

    // Verify each parity block
    for (let p = k; p < blocks.length; p++) {
      const parityBlock = blocks[p];
      // XOR the source blocks together
      const expected = new Uint8Array(10);
      for (const srcIdx of parityBlock.sourceIndices) {
        for (let j = 0; j < 10; j++) {
          expected[j] ^= blocks[srcIdx].payload[j];
        }
      }
      expect(Array.from(parityBlock.payload)).toEqual(Array.from(expected));
    }
  });

  it('all blocks have correct blockSize payload', () => {
    const data = new Uint8Array(73);
    const blockSize = 20;
    const blocks = encodeBlocks(data, blockSize, 0.5);
    for (const block of blocks) {
      expect(block.payload.length).toBe(blockSize);
    }
  });

  it('redundancy 0 still produces parity (minimum 1)', () => {
    const data = new Uint8Array(50);
    const blocks = encodeBlocks(data, 25, 0);
    // k=2, redundancy 0 → max(1, ceil(2*0))=1 parity block
    expect(blocks.length).toBe(3); // 2 systematic + 1 parity
  });

  it('high redundancy produces many parity blocks', () => {
    const data = new Uint8Array(100);
    const blocks = encodeBlocks(data, 25, 2.0);
    // k=4, redundancy 2.0 → ceil(4*2)=8 parity blocks
    expect(blocks.length).toBe(12); // 4 systematic + 8 parity
  });
});

describe('decoder edge cases', () => {
  it('getMissing reflects actual missing count', () => {
    const decoder = new FountainDecoder(4, 25, 100);
    expect(decoder.getMissing()).toBe(4);

    const data = new Uint8Array(100);
    const blocks = encodeBlocks(data, 25, 0.5);

    decoder.addBlock(blocks[0]);
    expect(decoder.getMissing()).toBe(3);

    decoder.addBlock(blocks[1]);
    expect(decoder.getMissing()).toBe(2);
  });

  it('addBlock returns true on already-complete decoder', () => {
    const data = new Uint8Array(25);
    const blocks = encodeBlocks(data, 25, 0.5);
    const decoder = new FountainDecoder(1, 25, 25);

    expect(decoder.addBlock(blocks[0])).toBe(true);
    expect(decoder.addBlock(blocks[1])).toBe(true); // already complete
  });

  it('handles 2-block data with single loss', () => {
    const data = new Uint8Array(50);
    for (let i = 0; i < 50; i++) data[i] = i * 2;

    const blocks = encodeBlocks(data, 25, 0.5);
    const decoder = new FountainDecoder(2, 25, 50);

    // Skip block 0, provide block 1 + parity
    decoder.addBlock(blocks[1]);
    for (let i = 2; i < blocks.length; i++) {
      if (decoder.addBlock(blocks[i])) break;
    }

    expect(decoder.isComplete()).toBe(true);
    expect(Array.from(decoder.getDecoded())).toEqual(Array.from(data));
  });

  it('decoder with k=1 completes on first block', () => {
    const data = new Uint8Array([10, 20, 30]);
    const blocks = encodeBlocks(data, 130, 0.5);
    const decoder = new FountainDecoder(1, 130, 3);

    expect(decoder.addBlock(blocks[0])).toBe(true);
    const result = decoder.getDecoded();
    expect(result[0]).toBe(10);
    expect(result[1]).toBe(20);
    expect(result[2]).toBe(30);
  });

  it('progress goes from 0 to 1', () => {
    const data = new Uint8Array(80);
    const blocks = encodeBlocks(data, 20, 0.5);
    const decoder = new FountainDecoder(4, 20, 80);

    expect(decoder.getProgress()).toBe(0);
    decoder.addBlock(blocks[0]);
    expect(decoder.getProgress()).toBe(0.25);
    decoder.addBlock(blocks[1]);
    expect(decoder.getProgress()).toBe(0.5);
    decoder.addBlock(blocks[2]);
    expect(decoder.getProgress()).toBe(0.75);
    decoder.addBlock(blocks[3]);
    expect(decoder.getProgress()).toBe(1);
  });
});

describe('realistic file transfer sizes', () => {
  it('handles 1KB file', () => {
    const data = new Uint8Array(1024);
    for (let i = 0; i < 1024; i++) data[i] = i & 0xFF;

    const blockSize = 130;
    const k = Math.ceil(1024 / blockSize);
    const blocks = encodeBlocks(data, blockSize, 0.5);
    const decoder = new FountainDecoder(k, blockSize, 1024);

    for (const block of blocks) {
      if (decoder.addBlock(block)) break;
    }

    expect(decoder.isComplete()).toBe(true);
    expect(Array.from(decoder.getDecoded())).toEqual(Array.from(data));
  });

  it('handles 10KB file with modest packet loss', () => {
    const data = new Uint8Array(10240);
    for (let i = 0; i < 10240; i++) data[i] = (i * 17 + 5) & 0xFF;

    const blockSize = 130;
    const k = Math.ceil(10240 / blockSize); // 79
    // Higher redundancy to tolerate losses
    const blocks = encodeBlocks(data, blockSize, 1.0);
    const decoder = new FountainDecoder(k, blockSize, 10240);

    // Drop a few specific systematic blocks (within parity recovery range)
    const dropSet = new Set([3, 15, 30]);
    for (const block of blocks) {
      if (dropSet.has(block.index)) continue;
      if (decoder.addBlock(block)) break;
    }

    expect(decoder.isComplete()).toBe(true);
    expect(Array.from(decoder.getDecoded())).toEqual(Array.from(data));
  });
});
