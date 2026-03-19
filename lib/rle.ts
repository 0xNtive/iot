/**
 * Run-Length Encoding for monochrome and grayscale pixel data.
 */

// === 1-bit (B&W) RLE ===
// Each byte: [color:1 bit (MSB)][length:7 bits (1-127)]

const MAX_RUN_1BIT = 127;
const COLOR_BIT = 0x80;

export function rleEncode(pixels: boolean[]): Uint8Array {
  if (pixels.length === 0) return new Uint8Array(0);

  const runs: number[] = [];
  let current = pixels[0];
  let count = 1;

  for (let i = 1; i < pixels.length; i++) {
    if (pixels[i] === current && count < MAX_RUN_1BIT) {
      count++;
    } else {
      runs.push(current ? (COLOR_BIT | count) : count);
      current = pixels[i];
      count = 1;
    }
  }
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

  for (let i = pos; i < totalPixels; i++) {
    pixels[i] = false;
  }

  return pixels;
}

// === Grayscale RLE ===
// Each run is 2 bytes: [value (0-255)][length (1-255)]

const MAX_RUN_GRAY = 255;

export function rleEncodeGray(pixels: number[]): Uint8Array {
  if (pixels.length === 0) return new Uint8Array(0);

  const runs: number[] = [];
  let current = pixels[0];
  let count = 1;

  for (let i = 1; i < pixels.length; i++) {
    if (pixels[i] === current && count < MAX_RUN_GRAY) {
      count++;
    } else {
      runs.push(current, count);
      current = pixels[i];
      count = 1;
    }
  }
  runs.push(current, count);

  return new Uint8Array(runs);
}

export function rleDecodeGray(encoded: Uint8Array, totalPixels: number): number[] {
  const pixels: number[] = new Array(totalPixels);
  let pos = 0;

  for (let i = 0; i + 1 < encoded.length && pos < totalPixels; i += 2) {
    const value = encoded[i];
    const length = encoded[i + 1];

    const end = Math.min(pos + length, totalPixels);
    for (let j = pos; j < end; j++) {
      pixels[j] = value;
    }
    pos = end;
  }

  for (let i = pos; i < totalPixels; i++) {
    pixels[i] = 0;
  }

  return pixels;
}

// === Quantization ===

/**
 * Quantize grayscale values to N levels (2, 4, 8, 16).
 * Merges nearby shades into the same bucket for better RLE compression.
 */
export function quantize(pixels: number[], levels: number): number[] {
  if (levels < 2) levels = 2;
  const maxVal = levels - 1;
  const step = 256 / levels;
  return pixels.map(v => {
    const bucket = Math.min(Math.floor(v / step), maxVal);
    return bucket;
  });
}

/**
 * Expand quantized values back to 0-255 range for display.
 */
export function dequantize(pixels: number[], levels: number): number[] {
  const maxVal = levels - 1;
  return pixels.map(v => maxVal > 0 ? Math.round((v / maxVal) * 255) : 0);
}

export function rleRatio(pixels: boolean[]): number {
  const raw = Math.ceil(pixels.length / 8);
  const encoded = rleEncode(pixels);
  return encoded.length / raw;
}
