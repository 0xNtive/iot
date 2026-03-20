import { describe, it, expect } from 'vitest';
import { splitTextBatch } from '../lib/text-utils.js';

describe('Text Batch Splitting', () => {
  it('should return single chunk for short text', () => {
    const chunks = splitTextBatch('hello world');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('hello world');
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].total).toBe(1);
  });

  it('should split long text into multiple chunks', () => {
    const longText = 'a'.repeat(300);
    const chunks = splitTextBatch(longText, 100);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, i) => {
      expect(chunk.bytes).toBeLessThanOrEqual(100);
      expect(chunk.index).toBe(i);
      expect(chunk.total).toBe(chunks.length);
    });
  });

  it('should handle empty string', () => {
    const chunks = splitTextBatch('');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('');
    expect(chunks[0].bytes).toBe(0);
  });

  it('should respect maxBytes parameter', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const chunks = splitTextBatch(text, 20);
    chunks.forEach(chunk => {
      expect(chunk.bytes).toBeLessThanOrEqual(20);
    });
  });

  it('should handle UTF-8 multi-byte characters', () => {
    const text = '🦞'.repeat(50); // 4 bytes each
    const chunks = splitTextBatch(text, 20);
    chunks.forEach(chunk => {
      expect(chunk.bytes).toBeLessThanOrEqual(20);
    });
  });

  it('should throw for non-positive maxBytes', () => {
    expect(() => splitTextBatch('hello', 0)).toThrow('maxBytes must be positive');
    expect(() => splitTextBatch('hello', -1)).toThrow('maxBytes must be positive');
  });

  it('should prefer splitting at word boundaries', () => {
    const text = 'hello world foo bar baz';
    const chunks = splitTextBatch(text, 15);
    // Should not split mid-word when possible
    chunks.forEach(chunk => {
      expect(chunk.text.trim()).toBe(chunk.text);
    });
  });

  it('should set correct total on all chunks', () => {
    const longText = 'word '.repeat(100);
    const chunks = splitTextBatch(longText, 50);
    const total = chunks.length;
    chunks.forEach(chunk => {
      expect(chunk.total).toBe(total);
    });
  });

  it('should handle text exactly at maxBytes', () => {
    const text = 'a'.repeat(138); // MAX_TEXT_BYTES = 138
    const chunks = splitTextBatch(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].bytes).toBe(138);
  });

  it('should handle text one byte over maxBytes', () => {
    const text = 'a'.repeat(139);
    const chunks = splitTextBatch(text);
    expect(chunks.length).toBeGreaterThan(1);
  });
});
