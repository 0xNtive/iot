import { describe, it, expect } from 'vitest';
import { encodeChunkedImage, encodeChunkedGrayImage, decodeChunkFrame, ChunkAssembler, CHUNK_TYPE } from '../lib/chunked.js';
import { MAX_PAYLOAD } from '../lib/constants.js';

describe('encodeChunkedImage', () => {
  it('encodes a small image as a single chunk', () => {
    const pixels = new Array(16 * 16).fill(false);
    pixels[0] = true;
    const chunks = encodeChunkedImage(16, 16, pixels);

    expect(chunks.length).toBe(1);
    expect(chunks[0][0]).toBe(CHUNK_TYPE);
    expect(chunks[0][1]).toBe(0);
    expect(chunks[0][2]).toBe(1);
    expect(chunks[0].length).toBeLessThanOrEqual(MAX_PAYLOAD);
  });

  it('encodes 64x64 image into multiple chunks', () => {
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
});

describe('encodeChunkedGrayImage', () => {
  it('encodes 4-level grayscale', () => {
    const pixels = new Array(32 * 32).fill(0);
    pixels[0] = 3; pixels[1] = 2; pixels[2] = 1;
    const chunks = encodeChunkedGrayImage(32, 32, pixels, 2);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0][0]).toBe(CHUNK_TYPE);
  });

  it('compresses well when few unique values', () => {
    // All same value — great RLE
    const pixels = new Array(128 * 128).fill(2);
    const chunks = encodeChunkedGrayImage(128, 128, pixels, 2);
    expect(chunks.length).toBeLessThan(5);
  });
});

describe('ChunkAssembler', () => {
  it('assembles single-chunk B&W image', () => {
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
    // ChunkAssembler returns number[] — compare numerically
    expect(result!.pixels[0]).toBe(1);
    expect(result!.pixels[255]).toBe(1);
    expect(result!.pixels[1]).toBe(0);
  });

  it('assembles multi-chunk image', () => {
    const boolPixels = new Array(64 * 64).fill(false).map((_, i) => i % 5 === 0);
    const chunks = encodeChunkedImage(64, 64, boolPixels);
    expect(chunks.length).toBeGreaterThan(1);

    const assembler = new ChunkAssembler();
    let result = null;
    for (const raw of chunks) {
      result = assembler.addChunk(decodeChunkFrame(raw));
    }

    expect(result).not.toBeNull();
    expect(result!.width).toBe(64);
    expect(result!.height).toBe(64);
    // Verify roundtrip: pixel at index 0 (0%5==0) should be 1, index 1 should be 0
    expect(result!.pixels[0]).toBe(1);
    expect(result!.pixels[1]).toBe(0);
    expect(result!.pixels[5]).toBe(1);
  });

  it('assembles grayscale multi-chunk image', () => {
    const pixels = new Array(64 * 64).fill(0).map((_, i) => i % 4);
    const chunks = encodeChunkedGrayImage(64, 64, pixels, 2);

    const assembler = new ChunkAssembler();
    let result = null;
    for (const raw of chunks) {
      result = assembler.addChunk(decodeChunkFrame(raw));
    }

    expect(result).not.toBeNull();
    expect(result!.pixels[0]).toBe(0);
    expect(result!.pixels[1]).toBe(1);
    expect(result!.pixels[2]).toBe(2);
    expect(result!.pixels[3]).toBe(3);
  });

  it('calls progress callback on each chunk', () => {
    const boolPixels = new Array(64 * 64).fill(false).map((_, i) => i % 5 === 0);
    const chunks = encodeChunkedImage(64, 64, boolPixels);
    const progressCalls: number[] = [];

    const assembler = new ChunkAssembler((_, __, ___, ____, progress) => {
      progressCalls.push(progress);
    });

    for (const raw of chunks) {
      assembler.addChunk(decodeChunkFrame(raw));
    }

    expect(progressCalls.length).toBe(chunks.length);
    expect(progressCalls[progressCalls.length - 1]).toBe(1);
  });
});
