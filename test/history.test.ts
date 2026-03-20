import { describe, it, expect, beforeEach } from 'vitest';
import { TransmissionLog } from '../lib/history.js';

describe('TransmissionLog', () => {
  let log: TransmissionLog;

  beforeEach(() => {
    log = new TransmissionLog(5); // Small buffer for testing
  });

  it('should create log with specified capacity', () => {
    const smallLog = new TransmissionLog(3);
    expect(smallLog.size()).toBe(0);
    expect(smallLog.isFull()).toBe(false);
  });

  it('should throw error for invalid capacity', () => {
    expect(() => new TransmissionLog(0)).toThrow('maxSize must be positive');
    expect(() => new TransmissionLog(-1)).toThrow('maxSize must be positive');
  });

  it('should log sent events', () => {
    log.logSent('QR', 100, { ecLevel: 'L' });

    const events = log.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('sent');
    expect(events[0].frameType).toBe('QR');
    expect(events[0].bytes).toBe(100);
    expect(events[0].metadata?.ecLevel).toBe('L');
    expect(events[0].timestamp).toBeTypeOf('number');
  });

  it('should log received events', () => {
    log.logReceived('IMG', 200, { width: 32, height: 24 });

    const events = log.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('received');
    expect(events[0].frameType).toBe('IMG');
    expect(events[0].bytes).toBe(200);
    expect(events[0].metadata?.width).toBe(32);
  });

  it('should log error events', () => {
    log.logError('Frame decode failed', { reason: 'CRC mismatch' });

    const events = log.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('error');
    expect(events[0].error).toBe('Frame decode failed');
    expect(events[0].metadata?.reason).toBe('CRC mismatch');
  });

  it('should maintain chronological order', () => {
    log.logSent('QR', 100);
    log.logReceived('IMG', 200);
    log.logError('Test error');

    const events = log.getEvents();
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe('sent');
    expect(events[1].type).toBe('received');
    expect(events[2].type).toBe('error');

    // Timestamps should be in order
    expect(events[0].timestamp).toBeLessThanOrEqual(events[1].timestamp);
    expect(events[1].timestamp).toBeLessThanOrEqual(events[2].timestamp);
  });

  it('should implement circular buffer correctly', () => {
    // Fill beyond capacity
    for (let i = 0; i < 7; i++) {
      log.logSent(`Frame${i}`, 100 + i);
    }

    const events = log.getEvents();
    expect(events).toHaveLength(5); // Buffer size
    expect(log.isFull()).toBe(true);

    // Should contain most recent events
    expect(events[0].frameType).toBe('Frame2'); // Oldest remaining
    expect(events[4].frameType).toBe('Frame6'); // Most recent
  });

  it('should get recent events in reverse order', () => {
    log.logSent('Frame1', 100);
    log.logSent('Frame2', 100);
    log.logSent('Frame3', 100);

    const recent = log.getRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].frameType).toBe('Frame3'); // Most recent first
    expect(recent[1].frameType).toBe('Frame2');
  });

  it('should filter events by time range', () => {
    const now = Date.now();
    
    log.logSent('Frame1', 100);
    
    // Simulate time passing
    const futureTime = now + 1000;
    const futureEvent = {
      type: 'sent' as const,
      timestamp: futureTime,
      frameType: 'Frame2',
      bytes: 200
    };
    (log as any).addEvent(futureEvent);

    const events = log.getEventsByTimeRange(now - 100, now + 500);
    expect(events).toHaveLength(1);
    expect(events[0].frameType).toBe('Frame1');
  });

  it('should filter events by type', () => {
    log.logSent('QR', 100);
    log.logReceived('IMG', 200);
    log.logError('Test error');
    log.logSent('TXT', 50);

    const sentEvents = log.getEventsByType('sent');
    expect(sentEvents).toHaveLength(2);
    expect(sentEvents[0].frameType).toBe('QR');
    expect(sentEvents[1].frameType).toBe('TXT');

    const errorEvents = log.getEventsByType('error');
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].error).toBe('Test error');
  });

  it('should clear all events', () => {
    log.logSent('Frame1', 100);
    log.logSent('Frame2', 200);

    expect(log.size()).toBe(2);

    log.clear();

    expect(log.size()).toBe(0);
    expect(log.isFull()).toBe(false);
    expect(log.getEvents()).toHaveLength(0);
  });

  it('should track buffer size correctly', () => {
    expect(log.size()).toBe(0);

    log.logSent('Frame1', 100);
    expect(log.size()).toBe(1);

    log.logSent('Frame2', 100);
    log.logSent('Frame3', 100);
    expect(log.size()).toBe(3);

    // Fill to capacity
    log.logSent('Frame4', 100);
    log.logSent('Frame5', 100);
    expect(log.size()).toBe(5);
    expect(log.isFull()).toBe(true);

    // Overflow
    log.logSent('Frame6', 100);
    expect(log.size()).toBe(5); // Still at capacity
    expect(log.isFull()).toBe(true);
  });

  it('should handle empty log operations', () => {
    expect(log.getEvents()).toHaveLength(0);
    expect(log.getRecent(10)).toHaveLength(0);
    expect(log.getEventsByType('sent')).toHaveLength(0);
    expect(log.getEventsByTimeRange(0, Date.now())).toHaveLength(0);
  });

  it('should preserve metadata correctly', () => {
    const metadata = {
      version: 1,
      compressed: true,
      sessionId: 'abc123',
      nested: { value: 42 }
    };

    log.logSent('DATA', 500, metadata);

    const events = log.getEvents();
    expect(events[0].metadata).toEqual(metadata);
    expect(events[0].metadata?.nested.value).toBe(42);
  });
});