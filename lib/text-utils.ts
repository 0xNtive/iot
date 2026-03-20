/**
 * Text utilities for batch sending and long message fragmentation
 */

import { MAX_TEXT_BYTES } from './constants.js';

export interface TextChunk {
  text: string;
  bytes: number;
  index: number;
  total: number;
}

/**
 * Split long text into multiple TXT-frame-sized chunks
 * @param text Text to split
 * @param maxBytes Maximum bytes per chunk (defaults to MAX_TEXT_BYTES)
 * @returns Array of text chunks
 */
export function splitTextBatch(text: string, maxBytes: number = MAX_TEXT_BYTES): TextChunk[] {
  if (maxBytes <= 0) {
    throw new Error('maxBytes must be positive');
  }

  const encoder = new TextEncoder();
  const fullBytes = encoder.encode(text);
  
  if (fullBytes.length <= maxBytes) {
    // Single chunk
    return [{
      text,
      bytes: fullBytes.length,
      index: 0,
      total: 1,
    }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  
  while (start < text.length) {
    // Find the largest substring that fits within maxBytes
    let end = text.length;
    let chunkBytes = encoder.encode(text.slice(start, end));
    
    // Binary search to find the largest valid chunk
    while (chunkBytes.length > maxBytes && end > start + 1) {
      end = start + Math.floor((end - start) / 2);
      chunkBytes = encoder.encode(text.slice(start, end));
    }
    
    // If even a single character is too large, we're in trouble
    if (chunkBytes.length > maxBytes && end === start + 1) {
      throw new Error(`Single character at position ${start} exceeds maxBytes (${chunkBytes.length} > ${maxBytes})`);
    }
    
    // Try to break at word boundaries to avoid splitting words
    let breakPoint = end;
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end - 1);
      const lastNewline = text.lastIndexOf('\n', end - 1);
      const lastBreak = Math.max(lastSpace, lastNewline);
      
      if (lastBreak > start) {
        const testBytes = encoder.encode(text.slice(start, lastBreak));
        if (testBytes.length <= maxBytes) {
          breakPoint = lastBreak;
          chunkBytes = testBytes;
        }
      }
    }
    
    const chunkText = text.slice(start, breakPoint);
    chunks.push({
      text: chunkText,
      bytes: chunkBytes.length,
      index: chunks.length,
      total: 0, // Will be set later
    });
    
    start = breakPoint;
    // Skip whitespace at the beginning of the next chunk
    while (start < text.length && /\s/.test(text[start])) {
      start++;
    }
  }
  
  // Set the total count for all chunks
  chunks.forEach(chunk => {
    chunk.total = chunks.length;
  });
  
  return chunks;
}