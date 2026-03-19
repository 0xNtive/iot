/**
 * Run-Length Encoding for monochrome pixel data.
 *
 * Each byte encodes one run:
 *   Bit 7 (MSB): color (0 = off, 1 = on)
 *   Bits 6-0:    run length (1-127)
 *
 * Example: 0x05 = 5 off-pixels, 0x83 = 3 on-pixels
 */

const MAX_RUN = 127;
const COLOR_BIT = 0x80;

export function rleEncode(pixels: boolean[]): Uint8Array {
  if (pixels.length === 0) return new Uint8Array(0);

  const runs: number[] = [];
  let current = pixels[0];
  let count = 1;

  for (let i = 1; i < pixels.length; i++) {
    if (pixels[i] === current && count < MAX_RUN) {
      count++;
    } else {
      runs.push(current ? (COLOR_BIT | count) : count);
      current = pixels[i];
      count = 1;
    }
  }
  // Flush last run
  runs.push(current ? (COLOR_BIT | count) : count);

  return new Uint8Array(runs);
}

export function rleDecode(encoded: Uint8Array, totalPixels: number): boolean[] {
  const pixels: boolean[] = new Array(totalPixels);
  let pos = 0;

  for (let i = 0; i < encoded.length && pos < totalPixels; i++) {
    const byte = encoded[i];
    const color = (byte & COLOR_BIT) !== 0;
    const length = byte & 0x7f;

    const end = Math.min(pos + length, totalPixels);
    for (let j = pos; j < end; j++) {
      pixels[j] = color;
    }
    pos = end;
  }

  // Fill remaining with false (in case of incomplete data / progressive)
  for (let i = pos; i < totalPixels; i++) {
    pixels[i] = false;
  }

  return pixels;
}

/**
 * Returns the compression ratio (encoded / raw).
 * Values < 1.0 mean compression saved space.
 */
export function rleRatio(pixels: boolean[]): number {
  const raw = Math.ceil(pixels.length / 8);
  const encoded = rleEncode(pixels);
  return encoded.length / raw;
}
