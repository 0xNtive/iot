import { describe, it, expect } from 'vitest';
import { encodeFrame, decodeFrame } from '../lib/protocol.js';
import { FrameType, type HelloMessage } from '../lib/types.js';

describe('HELLO Frame', () => {
  it('should encode and decode basic HELLO frame', () => {
    const msg: HelloMessage = {
      type: FrameType.HELLO,
      protocolVersion: 1,
      supportedFeatures: [1, 2, 3],
      capabilities: ['compression', 'encryption'],
    };

    const encoded = encodeFrame(msg);
    const decoded = decodeFrame(encoded) as HelloMessage;

    expect(decoded.type).toBe(FrameType.HELLO);
    expect(decoded.protocolVersion).toBe(1);
    expect(decoded.supportedFeatures).toEqual([1, 2, 3]);
    expect(decoded.capabilities).toEqual(['compression', 'encryption']);
  });

  it('should handle HELLO frame with no features', () => {
    const msg: HelloMessage = {
      type: FrameType.HELLO,
      protocolVersion: 2,
      supportedFeatures: [],
      capabilities: [],
    };

    const encoded = encodeFrame(msg);
    const decoded = decodeFrame(encoded) as HelloMessage;

    expect(decoded.protocolVersion).toBe(2);
    expect(decoded.supportedFeatures).toEqual([]);
    expect(decoded.capabilities).toEqual([]);
  });

  it('should handle HELLO frame with many features', () => {
    const msg: HelloMessage = {
      type: FrameType.HELLO,
      protocolVersion: 1,
      supportedFeatures: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      capabilities: ['rle', 'crc', 'encrypt', 'compress', 'stats'],
    };

    const encoded = encodeFrame(msg);
    const decoded = decodeFrame(encoded) as HelloMessage;

    expect(decoded.supportedFeatures).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(decoded.capabilities).toEqual(['rle', 'crc', 'encrypt', 'compress', 'stats']);
  });

  it('should handle HELLO frame with long capability strings', () => {
    const longCapability = 'a'.repeat(100); // 100 character string
    const msg: HelloMessage = {
      type: FrameType.HELLO,
      protocolVersion: 1,
      supportedFeatures: [1],
      capabilities: [longCapability, 'short'],
    };

    const encoded = encodeFrame(msg);
    const decoded = decodeFrame(encoded) as HelloMessage;

    expect(decoded.capabilities).toEqual([longCapability, 'short']);
  });

  it('should handle HELLO frame with UTF-8 capabilities', () => {
    const msg: HelloMessage = {
      type: FrameType.HELLO,
      protocolVersion: 1,
      supportedFeatures: [1, 2],
      capabilities: ['compression', 'encrypt🔒', '压缩', '암호화'],
    };

    const encoded = encodeFrame(msg);
    const decoded = decodeFrame(encoded) as HelloMessage;

    expect(decoded.capabilities).toEqual(['compression', 'encrypt🔒', '压缩', '암호화']);
  });

  it('should handle maximum protocol version', () => {
    const msg: HelloMessage = {
      type: FrameType.HELLO,
      protocolVersion: 255,
      supportedFeatures: [255, 254, 253],
      capabilities: ['max-version'],
    };

    const encoded = encodeFrame(msg);
    const decoded = decodeFrame(encoded) as HelloMessage;

    expect(decoded.protocolVersion).toBe(255);
    expect(decoded.supportedFeatures).toEqual([255, 254, 253]);
  });

  it('should reject capability string too long', () => {
    const tooLongCapability = 'a'.repeat(256); // 256 characters > 255 byte limit
    const msg: HelloMessage = {
      type: FrameType.HELLO,
      protocolVersion: 1,
      supportedFeatures: [],
      capabilities: [tooLongCapability],
    };

    expect(() => encodeFrame(msg)).toThrow('Capability string too long');
  });

  it('should handle frame size limits', () => {
    // Try to create a frame that's too large
    const manyCapabilities: string[] = [];
    for (let i = 0; i < 50; i++) {
      manyCapabilities.push('capability-' + i.toString().padStart(10, '0'));
    }

    const msg: HelloMessage = {
      type: FrameType.HELLO,
      protocolVersion: 1,
      supportedFeatures: Array.from({length: 100}, (_, i) => i),
      capabilities: manyCapabilities,
    };

    expect(() => encodeFrame(msg)).toThrow('HELLO frame too large');
  });

  it('should validate frame structure during decode', () => {
    // Test frame too short
    const shortFrame = new Uint8Array([FrameType.HELLO, 1, 0]); // Missing capability count
    expect(() => decodeFrame(shortFrame)).toThrow('HELLO frame too short');

    // Test frame missing feature data
    const missingFeatures = new Uint8Array([FrameType.HELLO, 1, 2]); // Says 2 features but none provided
    expect(() => decodeFrame(missingFeatures)).toThrow('HELLO frame too short');
  });

  it('should handle capability length validation', () => {
    // Create frame with capability count but missing capability length
    const frame = new Uint8Array([
      FrameType.HELLO, // Type
      1, // Protocol version
      0, // 0 features
      1, // 1 capability
      // Missing capability length byte
    ]);

    expect(() => decodeFrame(frame)).toThrow('HELLO frame too short for capability length');
  });

  it('should handle capability data validation', () => {
    // Create frame with capability length but insufficient data
    const frame = new Uint8Array([
      FrameType.HELLO, // Type
      1, // Protocol version
      0, // 0 features
      1, // 1 capability
      5, // Capability length = 5
      72, 101, 108 // Only 3 bytes of "Hel" (missing "lo")
    ]);

    expect(() => decodeFrame(frame)).toThrow('HELLO frame too short for capability data');
  });

  it('should preserve feature order', () => {
    const features = [10, 5, 15, 3, 8, 1, 12];
    const msg: HelloMessage = {
      type: FrameType.HELLO,
      protocolVersion: 1,
      supportedFeatures: features,
      capabilities: ['test'],
    };

    const encoded = encodeFrame(msg);
    const decoded = decodeFrame(encoded) as HelloMessage;

    expect(decoded.supportedFeatures).toEqual(features);
  });

  it('should handle empty strings in capabilities', () => {
    const msg: HelloMessage = {
      type: FrameType.HELLO,
      protocolVersion: 1,
      supportedFeatures: [1],
      capabilities: ['', 'normal', '', 'another'],
    };

    const encoded = encodeFrame(msg);
    const decoded = decodeFrame(encoded) as HelloMessage;

    expect(decoded.capabilities).toEqual(['', 'normal', '', 'another']);
  });
});