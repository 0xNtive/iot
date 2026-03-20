import { describe, it, expect } from 'vitest';
import { analyzeCompression } from '../lib/rle.js';

describe('Compression Analysis', () => {
  describe('Monochrome (1-bit) Analysis', () => {
    it('should analyze highly compressible monochrome data', () => {
      // Large runs of same color - should compress well
      const pixels = new Array(1000).fill(true).concat(new Array(1000).fill(false));
      
      const analysis = analyzeCompression(pixels, 1);
      
      expect(analysis.rawSize).toBe(Math.ceil(pixels.length / 8)); // 250 bytes
      expect(analysis.rleSize).toBeLessThan(analysis.rawSize);
      expect(analysis.ratio).toBeLessThan(0.8);
      expect(analysis.recommended).toBe(true);
    });

    it('should analyze poorly compressible monochrome data', () => {
      // Alternating pattern - should not compress well
      const pixels: boolean[] = [];
      for (let i = 0; i < 1000; i++) {
        pixels.push(i % 2 === 0);
      }
      
      const analysis = analyzeCompression(pixels, 1);
      
      expect(analysis.rawSize).toBe(Math.ceil(pixels.length / 8)); // 125 bytes
      expect(analysis.rleSize).toBeGreaterThanOrEqual(analysis.rawSize);
      expect(analysis.ratio).toBeGreaterThanOrEqual(1);
      expect(analysis.recommended).toBe(false);
    });

    it('should handle small monochrome images', () => {
      const pixels = [true, true, false, false, true];
      
      const analysis = analyzeCompression(pixels, 1);
      
      expect(analysis.rawSize).toBe(1); // 5 bits = 1 byte
      expect(analysis.rleSize).toBeGreaterThan(0);
      expect(analysis.ratio).toBeGreaterThan(0);
      expect(typeof analysis.recommended).toBe('boolean');
    });

    it('should handle all-same monochrome data', () => {
      const pixels = new Array(100).fill(true);
      
      const analysis = analyzeCompression(pixels, 1);
      
      expect(analysis.rawSize).toBe(13); // 100 bits = 13 bytes
      expect(analysis.rleSize).toBe(1); // Single run
      expect(analysis.ratio).toBeCloseTo(1/13, 2);
      expect(analysis.recommended).toBe(true);
    });

    it('should handle empty monochrome data', () => {
      const pixels: boolean[] = [];
      
      const analysis = analyzeCompression(pixels, 1);
      
      expect(analysis.rawSize).toBe(0);
      expect(analysis.rleSize).toBe(0);
      expect(analysis.ratio).toBe(0);
      expect(analysis.recommended).toBe(true);
    });
  });

  describe('Grayscale Analysis', () => {
    it('should analyze compressible grayscale data', () => {
      // Large runs of same gray value
      const pixels = new Array(500).fill(128).concat(new Array(500).fill(255));
      
      const analysis = analyzeCompression(pixels, 8);
      
      expect(analysis.rawSize).toBe(1000); // 1000 bytes
      expect(analysis.rleSize).toBeLessThan(analysis.rawSize);
      expect(analysis.ratio).toBeLessThan(0.8);
      expect(analysis.recommended).toBe(true);
    });

    it('should analyze gradient grayscale data', () => {
      // Smooth gradient - poor RLE compression
      const pixels: number[] = [];
      for (let i = 0; i < 256; i++) {
        pixels.push(i);
      }
      
      const analysis = analyzeCompression(pixels, 8);
      
      expect(analysis.rawSize).toBe(256); // 256 bytes
      expect(analysis.rleSize).toBeGreaterThanOrEqual(analysis.rawSize);
      expect(analysis.ratio).toBeGreaterThanOrEqual(1);
      expect(analysis.recommended).toBe(false);
    });

    it('should handle 2-bit grayscale', () => {
      const pixels = new Array(100).fill(3).concat(new Array(100).fill(0));
      
      const analysis = analyzeCompression(pixels, 2);
      
      expect(analysis.rawSize).toBe(200 * (2/8)); // 50 bytes
      expect(analysis.rleSize).toBeLessThan(analysis.rawSize);
      expect(analysis.recommended).toBe(true);
    });

    it('should handle 4-bit grayscale', () => {
      const pixels = new Array(80).fill(15).concat(new Array(80).fill(8));
      
      const analysis = analyzeCompression(pixels, 4);
      
      expect(analysis.rawSize).toBe(160 * (4/8)); // 80 bytes
      expect(analysis.rleSize).toBeLessThan(analysis.rawSize);
      expect(analysis.recommended).toBe(true);
    });

    it('should handle mixed grayscale patterns', () => {
      const pixels: number[] = [];
      // Mix of runs and variations
      pixels.push(...new Array(50).fill(100));    // Compressible run
      pixels.push(...Array.from({length: 50}, (_, i) => i)); // Poor compression
      pixels.push(...new Array(50).fill(200));    // Compressible run
      
      const analysis = analyzeCompression(pixels, 8);
      
      expect(analysis.rawSize).toBe(150);
      expect(analysis.rleSize).toBeGreaterThan(0);
      expect(analysis.ratio).toBeGreaterThan(0);
    });

    it('should calculate efficiency threshold correctly', () => {
      // Test the 20% threshold (ratio < 0.8)
      const highlyCompressible = new Array(1000).fill(127);
      const analysis1 = analyzeCompression(highlyCompressible, 8);
      expect(analysis1.recommended).toBe(true);
      
      // Create data that compresses to exactly 80% (boundary case)
      const boundaryData = [
        ...new Array(400).fill(100), // 400 same values = 2 bytes RLE
        ...Array.from({length: 400}, (_, i) => i % 256) // 400 different = 800 bytes RLE
      ];
      // Total: ~802 bytes RLE vs 800 bytes raw = ratio > 1
      const analysis2 = analyzeCompression(boundaryData, 8);
      expect(analysis2.recommended).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single pixel', () => {
      const mono = [true];
      const gray = [128];
      
      const monoAnalysis = analyzeCompression(mono, 1);
      const grayAnalysis = analyzeCompression(gray, 8);
      
      expect(monoAnalysis.rawSize).toBe(1);
      expect(grayAnalysis.rawSize).toBe(1);
      expect(monoAnalysis.rleSize).toBeGreaterThan(0);
      expect(grayAnalysis.rleSize).toBeGreaterThan(0);
    });

    it('should handle maximum runs', () => {
      // Test RLE limits (127 for mono, 255 for gray)
      const monoPixels = new Array(200).fill(true);
      const grayPixels = new Array(300).fill(255);
      
      const monoAnalysis = analyzeCompression(monoPixels, 1);
      const grayAnalysis = analyzeCompression(grayPixels, 8);
      
      expect(monoAnalysis.recommended).toBe(true);
      expect(grayAnalysis.recommended).toBe(true);
    });

    it('should be consistent with different array sizes', () => {
      // Same pattern, different sizes
      const pattern1 = new Array(100).fill(true).concat(new Array(100).fill(false));
      const pattern2 = new Array(200).fill(true).concat(new Array(200).fill(false));
      
      const analysis1 = analyzeCompression(pattern1, 1);
      const analysis2 = analyzeCompression(pattern2, 1);
      
      // Ratios should be similar for same pattern
      expect(Math.abs(analysis1.ratio - analysis2.ratio)).toBeLessThan(0.1);
      expect(analysis1.recommended).toBe(analysis2.recommended);
    });
  });
});