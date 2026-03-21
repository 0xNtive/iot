/**
 * Simple fountain codes — XOR-based erasure coding for lossy audio channel.
 *
 * Strategy:
 * 1. Split data into K source blocks of blockSize bytes
 * 2. First K encoded blocks are systematic (degree=1, direct copies)
 * 3. Additional parity blocks XOR 2-3 source blocks for redundancy
 * 4. Receiver can reconstruct from any K' blocks where K' >= K
 *    (with parity blocks filling in for lost systematic blocks)
 */

export interface EncodedBlock {
  index: number;
  degree: number;
  sourceIndices: number[];
  payload: Uint8Array;
}

/**
 * Encode source data into fountain-coded blocks.
 *
 * @param sourceData - Raw data to encode
 * @param blockSize - Bytes per source block
 * @param redundancy - Extra parity ratio (0.5 = 50% more blocks)
 * @returns Array of encoded blocks (K systematic + parity)
 */
export function encodeBlocks(
  sourceData: Uint8Array,
  blockSize: number,
  redundancy = 0.5,
): EncodedBlock[] {
  const k = Math.ceil(sourceData.length / blockSize);
  if (k < 1) return [];

  // Split into source blocks (zero-pad last one)
  const sourceBlocks: Uint8Array[] = [];
  for (let i = 0; i < k; i++) {
    const block = new Uint8Array(blockSize);
    const start = i * blockSize;
    const end = Math.min(start + blockSize, sourceData.length);
    block.set(sourceData.subarray(start, end));
    sourceBlocks.push(block);
  }

  const encoded: EncodedBlock[] = [];

  // Systematic blocks (degree=1): direct copies of source blocks
  for (let i = 0; i < k; i++) {
    encoded.push({
      index: i,
      degree: 1,
      sourceIndices: [i],
      payload: new Uint8Array(sourceBlocks[i]),
    });
  }

  // Parity blocks: XOR combinations of 2-3 source blocks
  const parityCount = Math.max(1, Math.ceil(k * redundancy));
  for (let p = 0; p < parityCount; p++) {
    const degree = k <= 2 ? k : (p % 2 === 0 ? 2 : 3);
    const actualDegree = Math.min(degree, k);
    const indices = selectParityIndices(p, k, actualDegree);
    const payload = xorBlocks(indices.map(i => sourceBlocks[i]), blockSize);

    encoded.push({
      index: k + p,
      degree: actualDegree,
      sourceIndices: indices,
      payload,
    });
  }

  return encoded;
}

/** Deterministically select source indices for parity block p. */
function selectParityIndices(p: number, k: number, degree: number): number[] {
  const indices: Set<number> = new Set();
  // Simple deterministic selection using p as seed
  let seed = (p * 7 + 13) & 0xFFFF;
  while (indices.size < degree) {
    seed = ((seed * 1103515245 + 12345) >>> 0) & 0xFFFF;
    indices.add(seed % k);
  }
  return Array.from(indices).sort((a, b) => a - b);
}

/** XOR multiple blocks together. */
function xorBlocks(blocks: Uint8Array[], size: number): Uint8Array {
  const result = new Uint8Array(size);
  for (const block of blocks) {
    for (let i = 0; i < size; i++) {
      result[i] ^= block[i];
    }
  }
  return result;
}

/**
 * Fountain decoder — collects encoded blocks and reconstructs source data.
 */
export class FountainDecoder {
  private k: number;
  private blockSize: number;
  private originalSize: number;
  private decoded: (Uint8Array | null)[];
  private decodedCount = 0;
  private pending: EncodedBlock[] = [];

  constructor(k: number, blockSize: number, originalSize: number) {
    this.k = k;
    this.blockSize = blockSize;
    this.originalSize = originalSize;
    this.decoded = new Array(k).fill(null);
  }

  /** Add an encoded block. Returns true when all K source blocks are decoded. */
  addBlock(block: EncodedBlock): boolean {
    if (this.isComplete()) return true;
    this.processBlock(block);
    return this.isComplete();
  }

  isComplete(): boolean {
    return this.decodedCount >= this.k;
  }

  getProgress(): number {
    return this.k > 0 ? this.decodedCount / this.k : 0;
  }

  getMissing(): number {
    return this.k - this.decodedCount;
  }

  /** Get the reconstructed data (only valid when isComplete()). */
  getDecoded(): Uint8Array {
    const result = new Uint8Array(this.originalSize);
    let offset = 0;
    for (let i = 0; i < this.k; i++) {
      const block = this.decoded[i];
      if (!block) continue;
      const copyLen = Math.min(this.blockSize, this.originalSize - offset);
      result.set(block.subarray(0, copyLen), offset);
      offset += this.blockSize;
    }
    return result;
  }

  private processBlock(block: EncodedBlock): void {
    // XOR out any already-decoded source blocks
    let unknownIndices: number[] = [];
    let payload: Uint8Array = Uint8Array.from(block.payload);

    for (const srcIdx of block.sourceIndices) {
      if (srcIdx >= this.k) continue;
      if (this.decoded[srcIdx]) {
        // XOR out the known block
        payload = xorWith(payload, this.decoded[srcIdx]!, this.blockSize) as Uint8Array;
      } else {
        unknownIndices.push(srcIdx);
      }
    }

    if (unknownIndices.length === 0) {
      // All source blocks already known — discard
      return;
    }

    if (unknownIndices.length === 1) {
      // Exactly one unknown — resolve it
      this.resolveBlock(unknownIndices[0], payload);
    } else {
      // Multiple unknowns — stash for later
      this.pending.push({
        index: block.index,
        degree: unknownIndices.length,
        sourceIndices: unknownIndices,
        payload,
      });
    }
  }

  private resolveBlock(index: number, payload: Uint8Array): void {
    if (this.decoded[index]) return;
    this.decoded[index] = new Uint8Array(payload.subarray(0, this.blockSize));
    this.decodedCount++;

    // Re-scan pending to see if any can now be resolved
    let changed = true;
    while (changed) {
      changed = false;
      const remaining: EncodedBlock[] = [];

      for (const pending of this.pending) {
        let pPayload: Uint8Array = Uint8Array.from(pending.payload);
        const unknown: number[] = [];

        for (const srcIdx of pending.sourceIndices) {
          if (this.decoded[srcIdx]) {
            pPayload = xorWith(pPayload, this.decoded[srcIdx]!, this.blockSize) as Uint8Array;
          } else {
            unknown.push(srcIdx);
          }
        }

        if (unknown.length === 0) {
          // Fully resolved already — discard
          continue;
        } else if (unknown.length === 1) {
          this.decoded[unknown[0]] = new Uint8Array(pPayload.subarray(0, this.blockSize));
          this.decodedCount++;
          changed = true;
        } else {
          remaining.push({
            index: pending.index,
            degree: unknown.length,
            sourceIndices: unknown,
            payload: pPayload,
          });
        }
      }

      this.pending = remaining;
    }
  }
}

/** XOR two buffers, returning a new buffer. */
function xorWith(a: Uint8Array, b: Uint8Array, size: number): Uint8Array {
  const result = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    result[i] = (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return result;
}
