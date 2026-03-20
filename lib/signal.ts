/**
 * Signal strength and quality estimation for audio transmission
 */

export interface SignalQuality {
  /** Signal to noise ratio in decibels */
  snr: number;
  /** Peak signal level (0-1) */
  peakLevel: number;
  /** RMS signal level (0-1) */
  rmsLevel: number;
  /** Background noise level (0-1) */
  noiseLevel: number;
  /** Overall quality score (0-100) */
  qualityScore: number;
  /** Quality category */
  quality: 'excellent' | 'good' | 'fair' | 'poor';
}

/**
 * Estimate signal quality from audio samples
 * @param samples Audio sample array
 * @returns Signal quality metrics
 */
export function estimateSignalQuality(samples: Float32Array): SignalQuality {
  if (samples.length === 0) {
    return {
      snr: -Infinity,
      peakLevel: 0,
      rmsLevel: 0,
      noiseLevel: 0,
      qualityScore: 0,
      quality: 'poor',
    };
  }

  // Calculate basic signal metrics
  let sum = 0;
  let sumSquares = 0;
  let peak = 0;
  
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    sum += abs;
    sumSquares += abs * abs;
    peak = Math.max(peak, abs);
  }
  
  const mean = sum / samples.length;
  const rms = Math.sqrt(sumSquares / samples.length);
  
  // Estimate noise floor (use lowest 10% of samples)
  const sortedAbs = Array.from(samples).map(Math.abs).sort((a, b) => a - b);
  const noiseFloorSamples = Math.max(1, Math.floor(samples.length * 0.1));
  let noiseSum = 0;
  for (let i = 0; i < noiseFloorSamples; i++) {
    noiseSum += sortedAbs[i];
  }
  const noiseLevel = noiseSum / noiseFloorSamples;
  
  // Calculate SNR
  const signalLevel = rms;
  const snrLinear = signalLevel / (noiseLevel + 1e-10); // Avoid division by zero
  const snrDb = 20 * Math.log10(snrLinear);
  
  // Calculate quality score (0-100)
  // Good SNR should be > 20dB, excellent > 30dB
  let qualityScore = 0;
  if (snrDb > 0) {
    qualityScore = Math.min(100, Math.max(0, (snrDb / 30) * 100));
  }
  
  // Adjust for signal level (too quiet or too loud is bad)
  const levelPenalty = Math.max(0, 1 - Math.abs(rms - 0.3) / 0.3);
  qualityScore *= levelPenalty;
  
  // Determine quality category
  let quality: SignalQuality['quality'];
  if (qualityScore >= 80) {
    quality = 'excellent';
  } else if (qualityScore >= 60) {
    quality = 'good';
  } else if (qualityScore >= 30) {
    quality = 'fair';
  } else {
    quality = 'poor';
  }
  
  return {
    snr: snrDb,
    peakLevel: peak,
    rmsLevel: rms,
    noiseLevel,
    qualityScore,
    quality,
  };
}