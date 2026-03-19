/**
 * Pack an array of booleans into bytes (MSB first, row-major).
 */
export function packBits(bits: boolean[]): Uint8Array {
  const byteCount = Math.ceil(bits.length / 8);
  const packed = new Uint8Array(byteCount);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) {
      packed[i >> 3] |= 0x80 >> (i & 7);
    }
  }
  return packed;
}

/**
 * Unpack bytes into an array of booleans (MSB first).
 */
export function unpackBits(packed: Uint8Array, totalBits: number): boolean[] {
  const bits: boolean[] = new Array(totalBits);
  for (let i = 0; i < totalBits; i++) {
    bits[i] = (packed[i >> 3] & (0x80 >> (i & 7))) !== 0;
  }
  return bits;
}
