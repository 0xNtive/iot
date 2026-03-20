import { describe, it, expect, beforeEach } from 'vitest';
import { TransmissionStats } from '../lib/stats.js';

describe('TransmissionStats', () => {
  let stats: TransmissionStats;

  beforeEach(() => {
    stats = new TransmissionStats();
  });

  it('should start with zero metrics', () => {
    const metrics = stats.getStats();
    expect(metrics.sentFrames).toBe(0);
    expect(metrics.receivedFrames).toBe(0);
    expect(metrics.sentBytes).toBe(0);
    expect(metrics.receivedBytes).toBe(0);
    expect(metrics.errorCount).toBe(0);
    expect(metrics.encodeTimeMs).toBe(0);
    expect(metrics.decodeTimeMs).toBe(0);
  });

  it('should record sent frames', () => {
    stats.recordSent(100, 5);
    stats.recordSent(150, 8);

    const metrics = stats.getStats();
    expect(metrics.sentFrames).toBe(2);
    expect(metrics.sentBytes).toBe(250);
    expect(metrics.encodeTimeMs).toBe(13);
    expect(metrics.lastSentAt).toBeTypeOf('number');
  });

  it('should record received frames', () => {
    stats.recordReceived(80, 3);
    stats.recordReceived(120, 7);

    const metrics = stats.getStats();
    expect(metrics.receivedFrames).toBe(2);
    expect(metrics.receivedBytes).toBe(200);
    expect(metrics.decodeTimeMs).toBe(10);
    expect(metrics.lastReceivedAt).toBeTypeOf('number');
  });

  it('should record errors', () => {
    stats.recordError('Test error 1');
    stats.recordError('Test error 2');

    const metrics = stats.getStats();
    expect(metrics.errorCount).toBe(2);
    expect(metrics.lastError).toBe('Test error 2');
    expect(metrics.lastErrorAt).toBeTypeOf('number');
  });

  it('should calculate error rate', () => {
    stats.recordSent(100, 5);
    stats.recordReceived(100, 5);
    stats.recordError('error 1');
    stats.recordError('error 2');

    // 2 errors out of 2 total frames = 100%
    expect(stats.getErrorRate()).toBe(100);
  });

  it('should calculate average encode time', () => {
    stats.recordSent(100, 10);
    stats.recordSent(100, 20);

    expect(stats.getAverageEncodeTime()).toBe(15);
  });

  it('should calculate average decode time', () => {
    stats.recordReceived(100, 5);
    stats.recordReceived(100, 15);

    expect(stats.getAverageDecodeTime()).toBe(10);
  });

  it('should handle zero division gracefully', () => {
    expect(stats.getErrorRate()).toBe(0);
    expect(stats.getAverageEncodeTime()).toBe(0);
    expect(stats.getAverageDecodeTime()).toBe(0);
  });

  it('should reset all statistics', () => {
    stats.recordSent(100, 5);
    stats.recordReceived(80, 3);
    stats.recordError('test error');

    stats.reset();

    const metrics = stats.getStats();
    expect(metrics.sentFrames).toBe(0);
    expect(metrics.receivedFrames).toBe(0);
    expect(metrics.errorCount).toBe(0);
    expect(metrics.lastSentAt).toBeUndefined();
    expect(metrics.lastReceivedAt).toBeUndefined();
    expect(metrics.lastErrorAt).toBeUndefined();
  });
});