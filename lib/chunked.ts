import { rleEncode, rleDecode, rleEncodeGray, rleDecodeGray } from './rle.js';
import { packBits, unpackBits, packValues, unpackValues } from './bitpack.js';
import { MAX_PAYLOAD, PROTOCOL_VERSION } from './constants.js';
import { encodePaletteImage, decodePaletteImage, type PaletteImage, type RGB } from './palette.js';

/**
 * Chunk frame format (type 0x04):
 *
 * ALL chunks:
 *   Byte 0:    0x04 (CHUNK type)
 *   Byte 1:    Chunk index (0-255)
 *   Byte 2:    Total chunks (1-255)
 *   Byte 3:    Flags [compression:2][bitDepth:2][reserved:4]
 *              compression: 00=raw, 01=RLE-1bit, 10=RLE-gray
 *              bitDepth:    00=1bit, 01=2bit, 10=4bit
 *
 * First chunk (index 0) — includes image dimensions:
 *   Byte 4:    Width high byte
 *   Byte 5:    Width low byte
 *   Byte 6:    Height high byte
 *   Byte 7:    Height low byte
 *   Byte 8:    Protocol version
 *   Bytes 9-N: Payload (up to 131 bytes)
 *
 * Subsequent chunks (index > 0):
 *   Byte 4:    Protocol version
 *   Bytes 5-N: Payload (up to 135 bytes)
 */

export const CHUNK_TYPE = 0x04;
const FIRST_HEADER = 9;
const NEXT_HEADER = 5;
const FIRST_PAYLOAD = MAX_PAYLOAD - FIRST_HEADER;  // 131
const NEXT_PAYLOAD = MAX_PAYLOAD - NEXT_HEADER;    // 135

export const enum Compression {
  Raw = 0,
  RLE = 1,
  RLEGray = 2,
  Palette = 3,
}

export const enum BitDepth {
  Mono = 0,   // 1-bit
  Gray4 = 1,  // 2-bit (4 levels)
  Gray16 = 2, // 4-bit (16 levels)
}

export interface ChunkFrame {
  index: number;
  total: number;
  compression: Compression;
  bitDepth: BitDepth;
  width: number;
  height: number;
  payload: Uint8Array;
}

/**
 * Encode a 1-bit (B&W) image into chunks.
 */
export function encodeChunkedImage(
  width: number,
  height: number,
  pixels: boolean[],
): Uint8Array[] {
  const raw = packBits(pixels);
  const rle = rleEncode(pixels);
  const useRle = rle.length < raw.length;
  const data = useRle ? rle : raw;
  const compression = useRle ? Compression.RLE : Compression.Raw;

  return buildChunks(width, height, data, compression, BitDepth.Mono);
}

/**
 * Encode a grayscale image into chunks.
 * pixels: array of quantized values (0 to 2^bitDepth - 1).
 * bitDepth: 1, 2, or 4.
 */
export function encodeChunkedGrayImage(
  width: number,
  height: number,
  pixels: number[],
  bitDepth: 1 | 2 | 4,
): Uint8Array[] {
  const bd: BitDepth = bitDepth === 1 ? BitDepth.Mono : bitDepth === 2 ? BitDepth.Gray4 : BitDepth.Gray16;

  if (bitDepth === 1) {
    // Use the optimized 1-bit path
    return encodeChunkedImage(width, height, pixels.map(v => v > 0));
  }

  // Try raw packing and gray RLE, pick smaller
  const raw = packValues(pixels, bitDepth);
  const rle = rleEncodeGray(pixels);
  const useRle = rle.length < raw.length;
  const data = useRle ? rle : raw;
  const compression = useRle ? Compression.RLEGray : Compression.Raw;

  return buildChunks(width, height, data, compression, bd);
}

/**
 * Encode a palette-indexed image into chunks using row-run compression.
 * Each color is encoded as horizontal runs per row — sparse colors compress to almost nothing.
 */
export function encodeChunkedPaletteImage(img: PaletteImage): Uint8Array[] {
  const data = encodePaletteImage(img);
  return buildChunks(img.width, img.height, data, Compression.Palette, BitDepth.Mono);
}

function buildChunks(
  width: number,
  height: number,
  data: Uint8Array,
  compression: Compression,
  bitDepth: BitDepth,
): Uint8Array[] {
  const flags = ((compression & 0x03) << 6) | ((bitDepth & 0x03) << 4);
  const chunks: Uint8Array[] = [];
  let offset = 0;

  // First chunk
  const firstSize = Math.min(data.length, FIRST_PAYLOAD);
  const firstFrame = new Uint8Array(FIRST_HEADER + firstSize);
  firstFrame[0] = CHUNK_TYPE;
  firstFrame[3] = flags;
  firstFrame[4] = (width >> 8) & 0xff;
  firstFrame[5] = width & 0xff;
  firstFrame[6] = (height >> 8) & 0xff;
  firstFrame[7] = height & 0xff;
  firstFrame[8] = PROTOCOL_VERSION;
  firstFrame.set(data.subarray(offset, offset + firstSize), FIRST_HEADER);
  offset += firstSize;
  chunks.push(firstFrame);

  // Subsequent chunks
  while (offset < data.length) {
    const size = Math.min(data.length - offset, NEXT_PAYLOAD);
    const frame = new Uint8Array(NEXT_HEADER + size);
    frame[0] = CHUNK_TYPE;
    frame[3] = flags;
    frame[4] = PROTOCOL_VERSION;
    frame.set(data.subarray(offset, offset + size), NEXT_HEADER);
    offset += size;
    chunks.push(frame);
  }

  // Fill in index and total
  const total = chunks.length;
  for (let i = 0; i < total; i++) {
    chunks[i][1] = i;
    chunks[i][2] = total;
  }

  return chunks;
}

export function decodeChunkFrame(data: Uint8Array): ChunkFrame {
  if (data.length < NEXT_HEADER) {
    throw new Error('Chunk frame too short');
  }
  if (data[0] !== CHUNK_TYPE) {
    throw new Error('Not a chunk frame');
  }

  const index = data[1];
  const total = data[2];
  const compression: Compression = (data[3] >> 6) & 0x03;
  const bitDepth: BitDepth = (data[3] >> 4) & 0x03;

  let width = 0;
  let height = 0;
  let payload: Uint8Array;

  if (index === 0) {
    if (data.length < FIRST_HEADER) {
      throw new Error('First chunk too short for header');
    }
    width = (data[4] << 8) | data[5];
    height = (data[6] << 8) | data[7];
    payload = data.slice(FIRST_HEADER);
  } else {
    payload = data.slice(NEXT_HEADER);
  }

  return { index, total, compression, bitDepth, width, height, payload };
}

export interface ChunkResult {
  width: number;
  height: number;
  pixels: number[];
  bitDepth: BitDepth;
  palette?: RGB[];
}

/**
 * Assembles chunks into a complete image with progressive rendering support.
 */
export class ChunkAssembler {
  private chunks: Map<number, Uint8Array> = new Map();
  private total = 0;
  private width = 0;
  private height = 0;
  private compression: Compression = Compression.Raw;
  private bitDepth: BitDepth = BitDepth.Mono;
  private onProgress?: (pixels: number[], width: number, height: number, bitDepth: BitDepth, progress: number, palette?: RGB[]) => void;

  constructor(onProgress?: (pixels: number[], width: number, height: number, bitDepth: BitDepth, progress: number, palette?: RGB[]) => void) {
    this.onProgress = onProgress;
  }

  addChunk(chunk: ChunkFrame): ChunkResult | null {
    if (chunk.index === 0) {
      this.chunks.clear();
      this.total = chunk.total;
      this.width = chunk.width;
      this.height = chunk.height;
      this.compression = chunk.compression;
      this.bitDepth = chunk.bitDepth;
    }

    this.chunks.set(chunk.index, chunk.payload);

    if (this.width > 0 && this.height > 0) {
      const partial = this.assemblePartial();
      const progress = this.chunks.size / this.total;
      this.onProgress?.(partial.pixels, this.width, this.height, this.bitDepth, progress, partial.palette);
    }

    if (this.chunks.size === this.total) {
      const result = this.assemblePartial();
      return {
        width: this.width, height: this.height,
        pixels: result.pixels, bitDepth: this.bitDepth,
        palette: result.palette,
      };
    }

    return null;
  }

  private assemblePartial(): { pixels: number[]; palette?: RGB[] } {
    const parts: Uint8Array[] = [];
    let totalLen = 0;
    for (let i = 0; i < this.total; i++) {
      const chunk = this.chunks.get(i);
      if (!chunk) break;
      parts.push(chunk);
      totalLen += chunk.length;
    }

    const combined = new Uint8Array(totalLen);
    let offset = 0;
    for (const part of parts) {
      combined.set(part, offset);
      offset += part.length;
    }

    const totalPixels = this.width * this.height;
    const actualBitDepth = this.bitDepth === BitDepth.Gray4 ? 2 : this.bitDepth === BitDepth.Gray16 ? 4 : 1;

    switch (this.compression) {
      case Compression.RLE:
        return { pixels: rleDecode(combined, totalPixels).map(b => b ? 1 : 0) };
      case Compression.RLEGray:
        return { pixels: rleDecodeGray(combined, totalPixels) };
      case Compression.Palette: {
        const result = decodePaletteImage(combined, this.width, this.height);
        return { pixels: result.indices, palette: result.palette };
      }
      case Compression.Raw:
        if (actualBitDepth === 1) {
          return { pixels: unpackBits(combined, totalPixels).map(b => b ? 1 : 0) };
        }
        return { pixels: unpackValues(combined, totalPixels, actualBitDepth) };
      default:
        return { pixels: unpackBits(combined, totalPixels).map(b => b ? 1 : 0) };
    }
  }

  reset(): void {
    this.chunks.clear();
    this.total = 0;
    this.width = 0;
    this.height = 0;
  }
}
