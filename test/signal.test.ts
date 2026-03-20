import { describe, it, expect } from 'vitest';
import { estimateSignalQuality } from '../lib/signal.js';

describe('Signal Quality Estimation', () => {
  it('should handle empty samples', () => {
    const samples = new Float32Array([]);
    const quality = estimateSignalQuality(samples);

    expect(quality.snr).toBe(-Infinity);
    expect(quality.peakLevel).toBe(0);
    expect(quality.rmsLevel).toBe(0);
    expect(quality.noiseLevel).toBe(0);
    expect(quality.qualityScore).toBe(0);
    expect(quality.quality).toBe('poor');
  });

  it('should detect silence', () => {
    const samples = new Float32Array(1000).fill(0);
    const quality = estimateSignalQuality(samples);

    expect(quality.peakLevel).toBe(0);
    expect(quality.rmsLevel).toBe(0);
    expect(quality.noiseLevel).toBe(0);
    expect(quality.quality).toBe('poor');
  });

  it('should analyze pure tone', () => {
    const samples = new Float32Array(1000);
    const frequency = 440; // A4 note
    const amplitude = 0.5;
    const sampleRate = 48000;

    for (let i = 0; i < samples.length; i++) {
      samples[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate);
    }

    const quality = estimateSignalQuality(samples);

    expect(quality.peakLevel).toBeCloseTo(amplitude, 1);
    expect(quality.rmsLevel).toBeCloseTo(amplitude / Math.sqrt(2), 1);
    expect(quality.qualityScore).toBeGreaterThan(50);
    expect(['excellent', 'good', 'fair']).toContain(quality.quality);
  });

  it('should analyze noisy signal', () => {
    const samples = new Float32Array(1000);
    
    // Add random noise
    for (let i = 0; i < samples.length; i++) {
      samples[i] = (Math.random() - 0.5) * 0.1; // Low amplitude noise
    }

    const quality = estimateSignalQuality(samples);

    expect(quality.peakLevel).toBeLessThan(0.1);
    expect(quality.rmsLevel).toBeLessThan(0.1);
    expect(quality.qualityScore).toBeLessThan(30);
    expect(quality.quality).toBe('poor');
  });

  it('should analyze mixed signal and noise', () => {
    const samples = new Float32Array(1000);
    const signalAmplitude = 0.3;
    const noiseAmplitude = 0.05;

    for (let i = 0; i < samples.length; i++) {
      const signal = signalAmplitude * Math.sin(2 * Math.PI * 1000 * i / 48000);
      const noise = (Math.random() - 0.5) * noiseAmplitude;
      samples[i] = signal + noise;
    }

    const quality = estimateSignalQuality(samples);

    expect(quality.peakLevel).toBeLessThanOrEqual(signalAmplitude + noiseAmplitude);
    expect(quality.rmsLevel).toBeGreaterThan(noiseAmplitude);
    expect(quality.snr).toBeGreaterThan(0);
  });

  it('should calculate SNR correctly', () => {
    const samples = new Float32Array(1000);
    const amplitude = 0.4;

    // Pure signal with known amplitude
    for (let i = 0; i < samples.length; i++) {
      samples[i] = amplitude * Math.sin(2 * Math.PI * 500 * i / 48000);
    }

    const quality = estimateSignalQuality(samples);

    expect(quality.snr).toBeGreaterThan(10); // Good SNR for clean signal
    expect(quality.qualityScore).toBeGreaterThan(0);
  });

  it('should penalize very loud signals', () => {
    const samples = new Float32Array(1000);
    
    // Very loud signal (clipping level)
    for (let i = 0; i < samples.length; i++) {
      samples[i] = 0.99 * Math.sin(2 * Math.PI * 440 * i / 48000);
    }

    const quality = estimateSignalQuality(samples);

    expect(quality.peakLevel).toBeCloseTo(0.99, 1);
    // Quality should be penalized for being too loud
    expect(quality.qualityScore).toBeLessThan(90);
  });

  it('should penalize very quiet signals', () => {
    const samples = new Float32Array(1000);
    
    // Very quiet signal
    for (let i = 0; i < samples.length; i++) {
      samples[i] = 0.01 * Math.sin(2 * Math.PI * 440 * i / 48000);
    }

    const quality = estimateSignalQuality(samples);

    expect(quality.peakLevel).toBeCloseTo(0.01, 2);
    // Quality should be penalized for being too quiet
    expect(quality.qualityScore).toBeLessThan(50);
  });

  it('should categorize quality correctly', () => {
    // Test excellent quality (clean, good level)
    const excellentSamples = new Float32Array(1000);
    for (let i = 0; i < excellentSamples.length; i++) {
      excellentSamples[i] = 0.3 * Math.sin(2 * Math.PI * 1000 * i / 48000);
    }
    const excellent = estimateSignalQuality(excellentSamples);
    expect(excellent.qualityScore).toBeGreaterThan(30);

    // Test poor quality (mostly noise)
    const poorSamples = new Float32Array(1000);
    for (let i = 0; i < poorSamples.length; i++) {
      poorSamples[i] = (Math.random() - 0.5) * 0.02;
    }
    const poor = estimateSignalQuality(poorSamples);
    expect(poor.quality).toBe('poor');
    expect(poor.qualityScore).toBeLessThan(30);
  });
});