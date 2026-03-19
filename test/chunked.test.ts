import { describe, it, expect } from 'vitest';
import { encodeChunkedImage, decodeChunkFrame, ChunkAssembler, CHUNK_TYPE } from '../lib/chunked.js';
import { MAX_PAYLOAD } from '../lib/constants.js';

describe('encodeChunkedImage', () => {
  it('encodes a small image as a single chunk', () => {
    const pixels = new Array(16 * 16).fill(false);
    pixels[0] = true;
    const chunks = encodeChunkedImage(16, 16, pixels);

    expect(chunks.length).toBe(1);
    expect(chunks[0][0]).toBe(CHUNK_TYPE);
    expect(chunks[0][1]).toBe(0); // index
    expect(chunks[0][2]).toBe(1); // total
    expect(chunks[0].length).toBeLessThanOrEqual(MAX_PAYLOAD);
  });

  it('encodes 64x64 image into multiple chunks', () => {
    // Alternating pattern — won't compress well with RLE, will use raw
    const pixels = new Array(64 * 64).fill(false).map((_, i) => i % 3 === 0);
    const chunks = encodeChunkedImage(64, 64, pixels);

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, i) => {
      expect(chunk[0]).toBe(CHUNK_TYPE);
      expect(chunk[1]).toBe(i);
      expect(chunk[2]).toBe(chunks.length);
      expect(chunk.length).toBeLessThanOrEqual(MAX_PAYLOAD);
    });
  });

  it('encodes 256x256 solid image with great RLE compression', () => {
    const pixels = new Array(256 * 256).fill(false);
    const chunks = encodeChunkedImage(256, 256, pixels);
    // 65536 pixels all off = 1 RLE byte per 127 pixels ≈ 516 bytes → ~4 chunks
    expect(chunks.length).toBeLessThan(10);
  });

  it('stores dimensions in first chunk', () => {
    const pixels = new Array(100 * 200).fill(false);
    const chunks = encodeChunkedImage(100, 200, pixels);
    const first = decodeChunkFrame(chunks[0]);
    expect(first.width).toBe(100);
    expect(first.height).toBe(200);
    expect(first.index).toBe(0);
  });

  it('handles 512x512 dimensions', () => {
    const pixels = new Array(512 * 512).fill(true);
    const chunks = encodeChunkedImage(512, 512, pixels);
    const first = decodeChunkFrame(chunks[0]);
    expect(first.width).toBe(512);
    expect(first.height).toBe(512);
    // All true = great RLE compression
    expect(chunks.length).toBeLessThan(20);
  });
});

describe('decodeChunkFrame', () => {
  it('decodes first chunk with dimensions', () => {
    const pixels = new Array(32 * 32).fill(false);
    const chunks = encodeChunkedImage(32, 32, pixels);
    const frame = decodeChunkFrame(chunks[0]);

    expect(frame.index).toBe(0);
    expect(frame.total).toBe(chunks.length);
    expect(frame.width).toBe(32);
    expect(frame.height).toBe(32);
    expect(frame.payload.length).toBeGreaterThan(0);
  });

  it('rejects too-short data', () => {
    expect(() => decodeChunkFrame(new Uint8Array([0x04]))).toThrow();
  });
});

describe('ChunkAssembler', () => {
  it('assembles single-chunk image', () => {
    const original = new Array(16 * 16).fill(false);
    original[0] = true;
    original[255] = true;

    const chunks = encodeChunkedImage(16, 16, original);
    const assembler = new ChunkAssembler();

    const frame = decodeChunkFrame(chunks[0]);
    const result = assembler.addChunk(frame);

    expect(result).not.toBeNull();
    expect(result!.width).toBe(16);
    expect(result!.height).toBe(16);
    expect(result!.pixels).toEqual(original);
  });

  it('assembles multi-chunk image', () => {
    const original = new Array(64 * 64).fill(false).map((_, i) => i % 5 === 0);
    const chunks = encodeChunkedImage(64, 64, original);
    expect(chunks.length).toBeGreaterThan(1);

    const assembler = new ChunkAssembler();
    let result = null;

    for (const raw of chunks) {
      const frame = decodeChunkFrame(raw);
      result = assembler.addChunk(frame);
    }

    expect(result).not.toBeNull();
    expect(result!.width).toBe(64);
    expect(result!.height).toBe(64);
    expect(result!.pixels).toEqual(original);
  });

  it('calls progress callback on each chunk', () => {
    const original = new Array(64 * 64).fill(false).map((_, i) => i % 5 === 0);
    const chunks = encodeChunkedImage(64, 64, original);
    const progressCalls: number[] = [];

    const assembler = new ChunkAssembler((_, __, ___, progress) => {
      progressCalls.push(progress);
    });

    for (const raw of chunks) {
      assembler.addChunk(decodeChunkFrame(raw));
    }

    expect(progressCalls.length).toBe(chunks.length);
    expect(progressCalls[progressCalls.length - 1]).toBe(1); // 100% on last
  });

  it('roundtrips 512x512 sparse image', () => {
    const original = new Array(512 * 512).fill(false);
    // Draw an X
    for (let i = 0; i < 512; i++) {
      original[i * 512 + i] = true;
      original[i * 512 + (511 - i)] = true;
    }

    const chunks = encodeChunkedImage(512, 512, original);
    const assembler = new ChunkAssembler();
    let result = null;

    for (const raw of chunks) {
      result = assembler.addChunk(decodeChunkFrame(raw));
    }

    expect(result).not.toBeNull();
    expect(result!.pixels).toEqual(original);
  });
});
