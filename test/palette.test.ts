import { describe, it, expect } from 'vitest';
import { quantizeColors, encodePaletteImage, decodePaletteImage } from '../lib/palette.js';
import { encodeChunkedPaletteImage, decodeChunkFrame, ChunkAssembler } from '../lib/chunked.js';

describe('quantizeColors', () => {
  it('quantizes a solid red image to 1 color', () => {
    const size = 4;
    const rgba = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      rgba[i * 4] = 255;     // R
      rgba[i * 4 + 1] = 0;   // G
      rgba[i * 4 + 2] = 0;   // B
      rgba[i * 4 + 3] = 255; // A
    }

    const result = quantizeColors(rgba, size, size, 16);
    expect(result.palette.length).toBeGreaterThanOrEqual(1);
    expect(result.indices.length).toBe(16);
    // All pixels should be same color index
    const firstIdx = result.indices[0];
    for (let i = 1; i < result.indices.length; i++) {
      expect(result.indices[i]).toBe(firstIdx);
    }
  });

  it('quantizes a two-tone image to 2 colors', () => {
    const size = 4;
    const rgba = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const isRed = i < 8;
      rgba[i * 4] = isRed ? 255 : 0;
      rgba[i * 4 + 1] = 0;
      rgba[i * 4 + 2] = isRed ? 0 : 255;
      rgba[i * 4 + 3] = 255;
    }

    const result = quantizeColors(rgba, size, size, 16);
    expect(result.palette.length).toBe(2);
    // Most common color first
    expect(result.indices[0]).toBe(0); // first half
    expect(result.indices[8]).toBe(1); // second half
  });
});

describe('encodePaletteImage / decodePaletteImage roundtrip', () => {
  it('roundtrips a simple 2-color image', () => {
    const size = 8;
    const rgba = new Uint8Array(size * size * 4);
    // Top half white, bottom half black
    for (let i = 0; i < size * size; i++) {
      const val = i < 32 ? 255 : 0;
      rgba[i * 4] = val;
      rgba[i * 4 + 1] = val;
      rgba[i * 4 + 2] = val;
      rgba[i * 4 + 3] = 255;
    }

    const palImg = quantizeColors(rgba, size, size, 16);
    const encoded = encodePaletteImage(palImg);
    const decoded = decodePaletteImage(encoded, size, size);

    expect(decoded.palette.length).toBe(palImg.palette.length);
    expect(decoded.indices.length).toBe(size * size);

    // All top-half pixels should be same index, all bottom-half same (different) index
    const topIdx = decoded.indices[0];
    const botIdx = decoded.indices[32];
    expect(topIdx).not.toBe(botIdx);
    for (let i = 0; i < 32; i++) expect(decoded.indices[i]).toBe(topIdx);
    for (let i = 32; i < 64; i++) expect(decoded.indices[i]).toBe(botIdx);
  });
});

describe('chunked palette roundtrip', () => {
  it('encodes and decodes via chunks', () => {
    const size = 16;
    const rgba = new Uint8Array(size * size * 4);
    // 4 colored quadrants
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const i = row * size + col;
        const isTop = row < 8;
        const isLeft = col < 8;
        rgba[i * 4] = isTop ? 255 : 0;
        rgba[i * 4 + 1] = isLeft ? 255 : 0;
        rgba[i * 4 + 2] = 0;
        rgba[i * 4 + 3] = 255;
      }
    }

    const palImg = quantizeColors(rgba, size, size, 16);
    const chunks = encodeChunkedPaletteImage(palImg);

    const assembler = new ChunkAssembler();
    let result = null;
    for (const raw of chunks) {
      result = assembler.addChunk(decodeChunkFrame(raw));
    }

    expect(result).not.toBeNull();
    expect(result!.width).toBe(size);
    expect(result!.height).toBe(size);
    expect(result!.palette).toBeDefined();
    expect(result!.palette!.length).toBeGreaterThanOrEqual(2);
    expect(result!.pixels.length).toBe(size * size);
  });

  it('row-run encoding is efficient for large solid regions', () => {
    const size = 64;
    const rgba = new Uint8Array(size * size * 4);
    // All white
    for (let i = 0; i < size * size * 4; i += 4) {
      rgba[i] = 255; rgba[i+1] = 255; rgba[i+2] = 255; rgba[i+3] = 255;
    }

    const palImg = quantizeColors(rgba, size, size, 16);
    const encoded = encodePaletteImage(palImg);
    // Single color, 64 rows × 1 run each = very small
    expect(encoded.length).toBeLessThan(300);

    const chunks = encodeChunkedPaletteImage(palImg);
    expect(chunks.length).toBeLessThanOrEqual(3);
  });
});
