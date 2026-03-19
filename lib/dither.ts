/**
 * Image dithering algorithms for improved grayscale rendering.
 *
 * Converts continuous luminance values into quantized levels with
 * perceptually better quality than simple thresholding.
 */

export type DitherAlgorithm = 'none' | 'floyd-steinberg' | 'atkinson';

/**
 * Apply dithering to a luminance image.
 *
 * @param luma   - Floating-point luminance values (0..255), row-major
 * @param width  - Image width in pixels
 * @param height - Image height in pixels
 * @param levels - Quantization levels (2=B&W, 4, 16)
 * @param algorithm - Dithering algorithm to use
 * @returns Array of quantized pixel values (0 to levels-1)
 */
export function ditherImage(
  luma: Float64Array,
  width: number,
  height: number,
  levels: number,
  algorithm: DitherAlgorithm,
): number[] {
  if (levels < 2) levels = 2;

  switch (algorithm) {
    case 'floyd-steinberg':
      return floydSteinberg(luma, width, height, levels);
    case 'atkinson':
      return atkinson(luma, width, height, levels);
    case 'none':
    default:
      return threshold(luma, levels);
  }
}

/** Simple threshold quantization (no dithering). */
function threshold(luma: Float64Array, levels: number): number[] {
  const maxVal = levels - 1;
  const step = 256 / levels;
  const result = new Array(luma.length);
  for (let i = 0; i < luma.length; i++) {
    result[i] = Math.min(Math.floor(luma[i] / step), maxVal);
  }
  return result;
}

/**
 * Floyd-Steinberg error diffusion.
 * Distributes quantization error to 4 neighbors:
 *
 *       X   7/16
 * 3/16  5/16  1/16
 */
function floydSteinberg(
  luma: Float64Array,
  width: number,
  height: number,
  levels: number,
): number[] {
  const maxVal = levels - 1;
  const step = 256 / levels;
  const buf = new Float64Array(luma);
  const result = new Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const old = buf[idx];
      const quantized = Math.min(Math.floor(Math.max(0, old) / step), maxVal);
      result[idx] = quantized;

      // Reconstruct the quantized value in 0..255 range
      const newVal = maxVal > 0 ? (quantized / maxVal) * 255 : 0;
      const err = old - newVal;

      // Diffuse error to neighbors
      if (x + 1 < width)                     buf[idx + 1]         += err * (7 / 16);
      if (y + 1 < height && x > 0)           buf[idx + width - 1] += err * (3 / 16);
      if (y + 1 < height)                    buf[idx + width]     += err * (5 / 16);
      if (y + 1 < height && x + 1 < width)  buf[idx + width + 1] += err * (1 / 16);
    }
  }

  return result;
}

/**
 * Atkinson dithering.
 * Distributes 6/8 of the error (higher contrast, good for pixel art):
 *
 *       X   1/8  1/8
 * 1/8  1/8  1/8
 *       1/8
 */
function atkinson(
  luma: Float64Array,
  width: number,
  height: number,
  levels: number,
): number[] {
  const maxVal = levels - 1;
  const step = 256 / levels;
  const buf = new Float64Array(luma);
  const result = new Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const old = buf[idx];
      const quantized = Math.min(Math.floor(Math.max(0, old) / step), maxVal);
      result[idx] = quantized;

      const newVal = maxVal > 0 ? (quantized / maxVal) * 255 : 0;
      const err = (old - newVal) / 8; // distribute 1/8 to each of 6 neighbors

      if (x + 1 < width)                     buf[idx + 1]             += err;
      if (x + 2 < width)                     buf[idx + 2]             += err;
      if (y + 1 < height && x > 0)           buf[idx + width - 1]     += err;
      if (y + 1 < height)                    buf[idx + width]         += err;
      if (y + 1 < height && x + 1 < width)  buf[idx + width + 1]     += err;
      if (y + 2 < height)                    buf[idx + 2 * width]     += err;
    }
  }

  return result;
}
