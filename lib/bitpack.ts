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

/**
 * Pack N-bit values into bytes (MSB first).
 * bitDepth must be 1, 2, or 4.
 */
export function packValues(values: number[], bitDepth: number): Uint8Array {
  const pixelsPerByte = 8 / bitDepth;
  const byteCount = Math.ceil(values.length / pixelsPerByte);
  const packed = new Uint8Array(byteCount);
  const mask = (1 << bitDepth) - 1;

  for (let i = 0; i < values.length; i++) {
    const byteIdx = Math.floor(i / pixelsPerByte);
    const bitPos = (pixelsPerByte - 1 - (i % pixelsPerByte)) * bitDepth;
    packed[byteIdx] |= (values[i] & mask) << bitPos;
  }
  return packed;
}

/**
 * Unpack N-bit values from bytes (MSB first).
 */
export function unpackValues(packed: Uint8Array, totalValues: number, bitDepth: number): number[] {
  const pixelsPerByte = 8 / bitDepth;
  const mask = (1 << bitDepth) - 1;
  const values: number[] = new Array(totalValues);

  for (let i = 0; i < totalValues; i++) {
    const byteIdx = Math.floor(i / pixelsPerByte);
    const bitPos = (pixelsPerByte - 1 - (i % pixelsPerByte)) * bitDepth;
    values[i] = (packed[byteIdx] >> bitPos) & mask;
  }
  return values;
}
