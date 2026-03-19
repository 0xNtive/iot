import { describe, it, expect } from 'vitest';
import { createQrMessage } from '../lib/qr.js';
import { encodeFrame, decodeFrame } from '../lib/protocol.js';
import { FrameType, ECLevel, type QrMessage } from '../lib/types.js';
import { MAX_PAYLOAD, QR_VERSIONS } from '../lib/constants.js';

describe('createQrMessage', () => {
  it('creates QR for short text', () => {
    const msg = createQrMessage('hi');
    expect(msg.type).toBe(FrameType.QR);
    expect(msg.version).toBeGreaterThanOrEqual(1);
    expect(msg.size).toBe(QR_VERSIONS[msg.version].size);
    expect(msg.modules.length).toBe(msg.size * msg.size);
    expect(msg.text).toBe('hi');
  });

  it('selects smallest version that fits', () => {
    const msg = createQrMessage('A');
    expect(msg.version).toBe(1);
    expect(msg.size).toBe(21);
  });

  it('uses specified version', () => {
    const msg = createQrMessage('test', { version: 2 });
    expect(msg.version).toBe(2);
    expect(msg.size).toBe(25);
  });

  it('uses specified EC level', () => {
    const msg = createQrMessage('test', { ecLevel: ECLevel.H });
    expect(msg.ecLevel).toBe(ECLevel.H);
  });

  it('roundtrips through encode/decode', () => {
    const original = createQrMessage('https://example.com');
    const frame = encodeFrame(original);
    expect(frame.length).toBeLessThanOrEqual(MAX_PAYLOAD);

    const decoded = decodeFrame(frame) as QrMessage;
    expect(decoded.type).toBe(FrameType.QR);
    expect(decoded.version).toBe(original.version);
    expect(decoded.ecLevel).toBe(original.ecLevel);
    expect(decoded.size).toBe(original.size);
    expect(decoded.modules).toEqual(original.modules);
  });

  it('throws for text too long', () => {
    // Very long text that can't fit in any version
    expect(() => createQrMessage('x'.repeat(200))).toThrow();
  });
});
