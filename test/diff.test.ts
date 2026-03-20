import { describe, it, expect } from 'vitest';
import { encodeDiff, applyDiff, encodeDiffGray, applyDiffGray } from '../lib/diff.js';

describe('Image Diff Encoding', () => {
  describe('Boolean Image Diff', () => {
    it('should encode diff between identical images', () => {
      const prev = [true, false, true, false];
      const curr = [true, false, true, false];

      const result = encodeDiff(prev, curr);

      expect(result.diff).toEqual([false, false, false, false]);
      expect(result.changedPixels).toBe(0);
      expect(result.efficiency).toBe(0);
    });

    it('should encode diff between completely different images', () => {
      const prev = [true, false, true, false];
      const curr = [false, true, false, true];

      const result = encodeDiff(prev, curr);

      expect(result.diff).toEqual([true, true, true, true]);
      expect(result.changedPixels).toBe(4);
      expect(result.efficiency).toBe(1);
    });

    it('should encode diff with partial changes', () => {
      const prev = [true, false, true, false, true];
      const curr = [true, true, true, true, false];

      const result = encodeDiff(prev, curr);

      expect(result.diff).toEqual([false, true, false, true, true]);
      expect(result.changedPixels).toBe(3);
      expect(result.efficiency).toBe(0.6);
    });

    it('should apply diff correctly', () => {
      const prev = [true, false, true, false];
      const diff = [false, true, false, true];

      const result = applyDiff(prev, diff);

      expect(result).toEqual([true, true, true, true]);
    });

    it('should roundtrip encode/apply correctly', () => {
      const prev = [true, false, true, false, false, true];
      const curr = [false, false, false, true, true, true];

      const diffResult = encodeDiff(prev, curr);
      const reconstructed = applyDiff(prev, diffResult.diff);

      expect(reconstructed).toEqual(curr);
    });

    it('should handle empty images', () => {
      const prev: boolean[] = [];
      const curr: boolean[] = [];

      const result = encodeDiff(prev, curr);

      expect(result.diff).toEqual([]);
      expect(result.changedPixels).toBe(0);
      expect(result.efficiency).toBe(0);
    });

    it('should throw error for size mismatch in encode', () => {
      const prev = [true, false];
      const curr = [true, false, true];

      expect(() => encodeDiff(prev, curr)).toThrow('Image size mismatch');
    });

    it('should throw error for size mismatch in apply', () => {
      const prev = [true, false];
      const diff = [true, false, true];

      expect(() => applyDiff(prev, diff)).toThrow('Size mismatch');
    });
  });

  describe('Grayscale Image Diff', () => {
    it('should encode XOR diff for grayscale images', () => {
      const prev = [100, 150, 200, 255];
      const curr = [100, 200, 150, 0];

      const diff = encodeDiffGray(prev, curr);

      // XOR differences: 100^100=0, 150^200=94, 200^150=94, 255^0=255
      expect(diff).toEqual([0, 94, 94, 255]);
    });

    it('should apply XOR diff for grayscale images', () => {
      const prev = [100, 150, 200, 255];
      const diff = [0, 94, 94, 255];

      const result = applyDiffGray(prev, diff);

      expect(result).toEqual([100, 200, 150, 0]);
    });

    it('should roundtrip grayscale diff correctly', () => {
      const prev = [0, 64, 128, 192, 255];
      const curr = [255, 192, 128, 64, 0];

      const diff = encodeDiffGray(prev, curr);
      const reconstructed = applyDiffGray(prev, diff);

      expect(reconstructed).toEqual(curr);
    });

    it('should handle identical grayscale images', () => {
      const prev = [100, 150, 200];
      const curr = [100, 150, 200];

      const diff = encodeDiffGray(prev, curr);

      expect(diff).toEqual([0, 0, 0]);

      const reconstructed = applyDiffGray(prev, diff);
      expect(reconstructed).toEqual(curr);
    });

    it('should throw error for grayscale size mismatch in encode', () => {
      const prev = [100, 150];
      const curr = [100, 150, 200];

      expect(() => encodeDiffGray(prev, curr)).toThrow('Image size mismatch');
    });

    it('should throw error for grayscale size mismatch in apply', () => {
      const prev = [100, 150];
      const diff = [50, 75, 100];

      expect(() => applyDiffGray(prev, diff)).toThrow('Size mismatch');
    });

    it('should handle edge values correctly', () => {
      const prev = [0, 255, 128];
      const curr = [255, 0, 128];

      const diff = encodeDiffGray(prev, curr);
      const reconstructed = applyDiffGray(prev, diff);

      expect(reconstructed).toEqual(curr);
    });
  });
});