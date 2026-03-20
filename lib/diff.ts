/**
 * Image diff encoding for delta frame transmission
 * Computes XOR diff between images to only encode changed pixels
 */

export interface DiffResult {
  /** Diff data as boolean array (true = pixel changed) */
  diff: boolean[];
  /** Number of changed pixels */
  changedPixels: number;
  /** Efficiency ratio (changedPixels / totalPixels) */
  efficiency: number;
}

/**
 * Encode XOR diff between two boolean images
 * @param prev Previous image pixels
 * @param curr Current image pixels
 * @returns Diff encoding result
 */
export function encodeDiff(prev: boolean[], curr: boolean[]): DiffResult {
  if (prev.length !== curr.length) {
    throw new Error(`Image size mismatch: prev=${prev.length}, curr=${curr.length}`);
  }

  const diff: boolean[] = new Array(prev.length);
  let changedPixels = 0;

  for (let i = 0; i < prev.length; i++) {
    const changed = prev[i] !== curr[i];
    diff[i] = changed;
    if (changed) {
      changedPixels++;
    }
  }

  const efficiency = prev.length > 0 ? changedPixels / prev.length : 0;

  return {
    diff,
    changedPixels,
    efficiency,
  };
}

/**
 * Apply diff to previous image to get current image
 * @param prev Previous image pixels
 * @param diff Diff data (true = pixel should be flipped)
 * @returns Reconstructed current image
 */
export function applyDiff(prev: boolean[], diff: boolean[]): boolean[] {
  if (prev.length !== diff.length) {
    throw new Error(`Size mismatch: prev=${prev.length}, diff=${diff.length}`);
  }

  const curr: boolean[] = new Array(prev.length);

  for (let i = 0; i < prev.length; i++) {
    curr[i] = diff[i] ? !prev[i] : prev[i];
  }

  return curr;
}

/**
 * Encode diff for grayscale images
 * @param prev Previous grayscale image
 * @param curr Current grayscale image
 * @returns XOR diff array
 */
export function encodeDiffGray(prev: number[], curr: number[]): number[] {
  if (prev.length !== curr.length) {
    throw new Error(`Image size mismatch: prev=${prev.length}, curr=${curr.length}`);
  }

  const diff: number[] = new Array(prev.length);

  for (let i = 0; i < prev.length; i++) {
    diff[i] = prev[i] ^ curr[i];
  }

  return diff;
}

/**
 * Apply diff to grayscale image
 * @param prev Previous grayscale image
 * @param diff XOR diff array
 * @returns Reconstructed current image
 */
export function applyDiffGray(prev: number[], diff: number[]): number[] {
  if (prev.length !== diff.length) {
    throw new Error(`Size mismatch: prev=${prev.length}, diff=${diff.length}`);
  }

  const curr: number[] = new Array(prev.length);

  for (let i = 0; i < prev.length; i++) {
    curr[i] = prev[i] ^ diff[i];
  }

  return curr;
}