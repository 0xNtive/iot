import { rleEncode, rleDecode } from './rle.js';
import { packBits, unpackBits } from './bitpack.js';
import { MAX_PAYLOAD, PROTOCOL_VERSION } from './constants.js';

/**
 * Chunk frame format (type 0x04):
 *
 * ALL chunks:
 *   Byte 0:    0x04 (CHUNK type)
 *   Byte 1:    Chunk index (0-255)
 *   Byte 2:    Total chunks (1-255)
 *   Byte 3:    Flags [compression:2][reserved:6]
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
const FIRST_HEADER = 9;     // type + index + total + flags + w(2) + h(2) + version
const NEXT_HEADER = 5;      // type + index + total + flags + version
const FIRST_PAYLOAD = MAX_PAYLOAD - FIRST_HEADER;  // 131
const NEXT_PAYLOAD = MAX_PAYLOAD - NEXT_HEADER;    // 135

export const enum Compression {
  Raw = 0,
  RLE = 1,
}

export interface ChunkFrame {
  index: number;
  total: number;
  compression: Compression;
  width: number;   // only meaningful on index 0
  height: number;  // only meaningful on index 0
  payload: Uint8Array;
}

/**
 * Encode an image into chunk frames ready for sequential transmission.
 * Automatically picks RLE vs raw based on which is smaller.
 */
export function encodeChunkedImage(
  width: number,
  height: number,
  pixels: boolean[],
): Uint8Array[] {
  // Try both encodings, pick smaller
  const raw = packBits(pixels);
  const rle = rleEncode(pixels);
  const useRle = rle.length < raw.length;
  const data = useRle ? rle : raw;
  const compression = useRle ? Compression.RLE : Compression.Raw;

  // Split data into chunks
  const chunks: Uint8Array[] = [];
  let offset = 0;

  // First chunk
  const firstSize = Math.min(data.length, FIRST_PAYLOAD);
  const firstFrame = new Uint8Array(FIRST_HEADER + firstSize);
  firstFrame[0] = CHUNK_TYPE;
  firstFrame[1] = 0; // index — filled after we know total
  firstFrame[2] = 0; // total — filled after
  firstFrame[3] = (compression & 0x03) << 6;
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
    frame[1] = chunks.length; // index
    frame[2] = 0; // total — filled after
    frame[3] = (compression & 0x03) << 6;
    frame[4] = PROTOCOL_VERSION;
    frame.set(data.subarray(offset, offset + size), NEXT_HEADER);
    offset += size;
    chunks.push(frame);
  }

  // Fill in total count and index
  const total = chunks.length;
  for (let i = 0; i < total; i++) {
    chunks[i][1] = i;
    chunks[i][2] = total;
  }

  return chunks;
}

/**
 * Decode a single chunk frame from raw bytes.
 */
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

  return { index, total, compression, width, height, payload };
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
  private onProgress?: (pixels: boolean[], width: number, height: number, progress: number) => void;

  constructor(onProgress?: (pixels: boolean[], width: number, height: number, progress: number) => void) {
    this.onProgress = onProgress;
  }

  /**
   * Feed a decoded chunk frame. Returns the complete image if all chunks received, null otherwise.
   */
  addChunk(chunk: ChunkFrame): { width: number; height: number; pixels: boolean[] } | null {
    if (chunk.index === 0) {
      // First chunk — reset state for new image
      this.chunks.clear();
      this.total = chunk.total;
      this.width = chunk.width;
      this.height = chunk.height;
      this.compression = chunk.compression;
    }

    this.chunks.set(chunk.index, chunk.payload);

    // Progressive render with what we have so far
    if (this.width > 0 && this.height > 0) {
      const partial = this.assemblePartial();
      const progress = this.chunks.size / this.total;
      this.onProgress?.(partial, this.width, this.height, progress);
    }

    // Check if complete
    if (this.chunks.size === this.total) {
      const pixels = this.assemblePartial();
      return { width: this.width, height: this.height, pixels };
    }

    return null;
  }

  private assemblePartial(): boolean[] {
    // Concatenate chunks in order (only contiguous from 0)
    const parts: Uint8Array[] = [];
    let totalLen = 0;
    for (let i = 0; i < this.total; i++) {
      const chunk = this.chunks.get(i);
      if (!chunk) break; // Stop at first gap
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
    if (this.compression === Compression.RLE) {
      return rleDecode(combined, totalPixels);
    } else {
      return unpackBits(combined, totalPixels);
    }
  }

  reset(): void {
    this.chunks.clear();
    this.total = 0;
    this.width = 0;
    this.height = 0;
  }
}
