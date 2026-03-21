import { describe, it, expect } from 'vitest';
import {
  encodeChunkedImage, encodeChunkedGrayImage, encodeChunkedPaletteImage,
  decodeChunkFrame, ChunkAssembler, CHUNK_TYPE,
} from '../lib/chunked.js';
import { quantizeColors } from '../lib/palette.js';
import { MAX_PAYLOAD } from '../lib/constants.js';

describe('chunk frame format', () => {
  it('all chunks are within MAX_PAYLOAD', () => {
    const pixels = new Array(128 * 128).fill(false).map((_, i) => i % 2 === 0);
    const chunks = encodeChunkedImage(128, 128, pixels);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MAX_PAYLOAD);
    }
  });

  it('chunk indices are sequential', () => {
    const pixels = new Array(64 * 64).fill(false).map((_, i) => i % 3 === 0);
    const chunks = encodeChunkedImage(64, 64, pixels);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i][1]).toBe(i);      // index
      expect(chunks[i][2]).toBe(chunks.length); // total
    }
  });

  it('first chunk has larger header (9 bytes) with dimensions', () => {
    const pixels = new Array(100 * 50).fill(false);
    const chunks = encodeChunkedImage(100, 50, pixels);
    const first = decodeChunkFrame(chunks[0]);
    expect(first.width).toBe(100);
    expect(first.height).toBe(50);
    expect(first.index).toBe(0);
  });

  it('subsequent chunks have no dimensions', () => {
    const pixels = new Array(128 * 128).fill(false).map((_, i) => i % 7 === 0);
    const chunks = encodeChunkedImage(128, 128, pixels);
    if (chunks.length > 1) {
      const second = decodeChunkFrame(chunks[1]);
      expect(second.width).toBe(0);
      expect(second.height).toBe(0);
      expect(second.index).toBe(1);
    }
  });
});

describe('decodeChunkFrame error handling', () => {
  it('throws on frame too short', () => {
    expect(() => decodeChunkFrame(new Uint8Array([CHUNK_TYPE, 0, 1]))).toThrow('Chunk frame too short');
  });

  it('throws on wrong frame type', () => {
    expect(() => decodeChunkFrame(new Uint8Array([0xFF, 0, 1, 0, 0]))).toThrow('Not a chunk frame');
  });

  it('throws on first chunk too short for header', () => {
    // Index 0 but only 5 bytes (needs at least 9 for first chunk)
    expect(() => decodeChunkFrame(new Uint8Array([CHUNK_TYPE, 0, 1, 0, 0]))).toThrow('First chunk too short');
  });
});

describe('compression strategy selection', () => {
  it('uses RLE for solid images (better compression)', () => {
    const pixels = new Array(256 * 256).fill(false);
    const chunks = encodeChunkedImage(256, 256, pixels);
    const first = decodeChunkFrame(chunks[0]);
    // RLE = 1 in compression field
    expect(first.compression).toBe(1);
  });

  it('uses raw for random-like patterns (RLE is worse)', () => {
    // Alternating pattern — worst case for RLE
    const pixels = new Array(32 * 32).fill(false).map((_, i) => i % 2 === 0);
    const chunks = encodeChunkedImage(32, 32, pixels);
    const first = decodeChunkFrame(chunks[0]);
    // Should choose raw since alternating pixels don't compress with RLE
    expect(first.compression).toBe(0); // Raw
  });
});

describe('grayscale chunked images', () => {
  it('encodes 16-level grayscale (4-bit)', () => {
    const pixels = new Array(32 * 32).fill(0).map((_, i) => i % 16);
    const chunks = encodeChunkedGrayImage(32, 32, pixels, 4);
    expect(chunks.length).toBeGreaterThanOrEqual(1);

    const assembler = new ChunkAssembler();
    let result = null;
    for (const raw of chunks) {
      result = assembler.addChunk(decodeChunkFrame(raw));
    }

    expect(result).not.toBeNull();
    expect(result!.pixels[0]).toBe(0);
    expect(result!.pixels[1]).toBe(1);
    expect(result!.pixels[15]).toBe(15);
  });

  it('1-bit grayscale falls back to boolean path', () => {
    const pixels = new Array(32 * 32).fill(0);
    pixels[0] = 1;
    pixels[10] = 1;
    const chunks = encodeChunkedGrayImage(32, 32, pixels, 1);

    const assembler = new ChunkAssembler();
    let result = null;
    for (const raw of chunks) {
      result = assembler.addChunk(decodeChunkFrame(raw));
    }
    expect(result).not.toBeNull();
    expect(result!.pixels[0]).toBe(1);
    expect(result!.pixels[10]).toBe(1);
    expect(result!.pixels[1]).toBe(0);
  });

  it('large grayscale image roundtrips correctly', () => {
    const size = 64;
    const pixels = new Array(size * size).fill(0).map((_, i) => i % 4);
    const chunks = encodeChunkedGrayImage(size, size, pixels, 2);

    const assembler = new ChunkAssembler();
    let result = null;
    for (const raw of chunks) {
      result = assembler.addChunk(decodeChunkFrame(raw));
    }

    expect(result).not.toBeNull();
    for (let i = 0; i < size * size; i++) {
      expect(result!.pixels[i]).toBe(i % 4);
    }
  });
});

describe('ChunkAssembler advanced', () => {
  it('resets state on new first chunk', () => {
    const pixels1 = new Array(16 * 16).fill(false);
    pixels1[0] = true;
    const chunks1 = encodeChunkedImage(16, 16, pixels1);

    const pixels2 = new Array(8 * 8).fill(false);
    pixels2[63] = true;
    const chunks2 = encodeChunkedImage(8, 8, pixels2);

    const assembler = new ChunkAssembler();
    // Start first image
    assembler.addChunk(decodeChunkFrame(chunks1[0]));

    // Start new image (resets)
    const result = assembler.addChunk(decodeChunkFrame(chunks2[0]));
    expect(result).not.toBeNull();
    expect(result!.width).toBe(8);
    expect(result!.height).toBe(8);
  });

  it('reset() clears all state', () => {
    const pixels = new Array(64 * 64).fill(false).map((_, i) => i % 5 === 0);
    const chunks = encodeChunkedImage(64, 64, pixels);

    const assembler = new ChunkAssembler();
    // Add first chunk
    assembler.addChunk(decodeChunkFrame(chunks[0]));
    // Reset
    assembler.reset();
    // Should need all chunks again
    let result = null;
    for (const raw of chunks) {
      result = assembler.addChunk(decodeChunkFrame(raw));
    }
    expect(result).not.toBeNull();
  });

  it('progress callback reports correct progress fractions', () => {
    const pixels = new Array(128 * 128).fill(false);
    const chunks = encodeChunkedImage(128, 128, pixels);
    const progressValues: number[] = [];

    const assembler = new ChunkAssembler((_, __, ___, ____, progress) => {
      progressValues.push(progress);
    });

    for (const raw of chunks) {
      assembler.addChunk(decodeChunkFrame(raw));
    }

    expect(progressValues.length).toBe(chunks.length);
    expect(progressValues[0]).toBeCloseTo(1 / chunks.length, 5);
    expect(progressValues[progressValues.length - 1]).toBe(1);
  });

  it('palette chunks pass palette in progress callback', () => {
    const size = 16;
    const rgba = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      rgba[i * 4] = i < 128 ? 255 : 0;
      rgba[i * 4 + 1] = 0;
      rgba[i * 4 + 2] = i < 128 ? 0 : 255;
      rgba[i * 4 + 3] = 255;
    }

    const palImg = quantizeColors(rgba, size, size, 16);
    const chunks = encodeChunkedPaletteImage(palImg);

    let receivedPalette: any = undefined;
    const assembler = new ChunkAssembler((_, __, ___, ____, _progress, palette) => {
      receivedPalette = palette;
    });

    for (const raw of chunks) {
      assembler.addChunk(decodeChunkFrame(raw));
    }

    expect(receivedPalette).toBeDefined();
    expect(receivedPalette!.length).toBeGreaterThanOrEqual(1);
  });
});

describe('large dimension images', () => {
  it('handles 512x512 image', () => {
    const pixels = new Array(512 * 512).fill(false);
    const chunks = encodeChunkedImage(512, 512, pixels);
    const first = decodeChunkFrame(chunks[0]);
    expect(first.width).toBe(512);
    expect(first.height).toBe(512);

    const assembler = new ChunkAssembler();
    let result = null;
    for (const raw of chunks) {
      result = assembler.addChunk(decodeChunkFrame(raw));
    }
    expect(result).not.toBeNull();
    expect(result!.width).toBe(512);
    expect(result!.height).toBe(512);
    expect(result!.pixels.length).toBe(512 * 512);
  });

  it('handles non-square image (200x50)', () => {
    const pixels = new Array(200 * 50).fill(false);
    pixels[0] = true;
    pixels[9999] = true;
    const chunks = encodeChunkedImage(200, 50, pixels);

    const assembler = new ChunkAssembler();
    let result = null;
    for (const raw of chunks) {
      result = assembler.addChunk(decodeChunkFrame(raw));
    }
    expect(result).not.toBeNull();
    expect(result!.width).toBe(200);
    expect(result!.height).toBe(50);
    expect(result!.pixels[0]).toBe(1);
    expect(result!.pixels[9999]).toBe(1);
  });
});
