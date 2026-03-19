import { describe, it, expect } from 'vitest';
import { encodeFrame, decodeFrame } from '../lib/protocol.js';
import { FrameType, ECLevel, type QrMessage, type ImgMessage, type TxtMessage } from '../lib/types.js';
import { PROTOCOL_VERSION, MAX_PAYLOAD } from '../lib/constants.js';

describe('QR frame', () => {
  it('encodes and decodes QR version 1', () => {
    const modules = new Array(21 * 21).fill(false).map((_, i) => i % 2 === 0);
    const msg: QrMessage = {
      type: FrameType.QR,
      version: 1,
      ecLevel: ECLevel.L,
      size: 21,
      modules,
    };

    const frame = encodeFrame(msg);
    expect(frame[0]).toBe(FrameType.QR);
    expect((frame[1] >> 4) & 0x0f).toBe(1);
    expect((frame[1] >> 2) & 0x03).toBe(ECLevel.L);
    expect(frame[2]).toBe(PROTOCOL_VERSION);
    expect(frame.length).toBe(3 + 56); // header + packed bits

    const decoded = decodeFrame(frame) as QrMessage;
    expect(decoded.type).toBe(FrameType.QR);
    expect(decoded.version).toBe(1);
    expect(decoded.ecLevel).toBe(ECLevel.L);
    expect(decoded.size).toBe(21);
    expect(decoded.modules).toEqual(modules);
  });

  it('encodes QR version 4 at maximum payload', () => {
    const modules = new Array(33 * 33).fill(true);
    const msg: QrMessage = {
      type: FrameType.QR,
      version: 4,
      ecLevel: ECLevel.H,
      size: 33,
      modules,
    };

    const frame = encodeFrame(msg);
    expect(frame.length).toBe(140);
  });

  it('rejects unsupported QR version', () => {
    const msg: QrMessage = {
      type: FrameType.QR,
      version: 5,
      ecLevel: ECLevel.L,
      size: 37,
      modules: new Array(37 * 37).fill(false),
    };
    expect(() => encodeFrame(msg)).toThrow('Unsupported QR version');
  });
});

describe('IMG frame', () => {
  it('encodes and decodes 16x16 image', () => {
    const pixels = new Array(16 * 16).fill(false).map((_, i) => i % 3 === 0);
    const msg: ImgMessage = {
      type: FrameType.IMG,
      width: 16,
      height: 16,
      pixels,
    };

    const frame = encodeFrame(msg);
    expect(frame[0]).toBe(FrameType.IMG);
    expect(frame[1]).toBe(16);
    expect(frame[2]).toBe(16);
    expect(frame[3]).toBe(PROTOCOL_VERSION);

    const decoded = decodeFrame(frame) as ImgMessage;
    expect(decoded.type).toBe(FrameType.IMG);
    expect(decoded.width).toBe(16);
    expect(decoded.height).toBe(16);
    expect(decoded.pixels).toEqual(pixels);
  });

  it('encodes and decodes 32x32 image', () => {
    const pixels = new Array(32 * 32).fill(true);
    const msg: ImgMessage = {
      type: FrameType.IMG,
      width: 32,
      height: 32,
      pixels,
    };

    const frame = encodeFrame(msg);
    expect(frame.length).toBe(4 + 128); // header + packed
    expect(frame.length).toBeLessThanOrEqual(MAX_PAYLOAD);
  });

  it('rejects oversized dimensions', () => {
    const msg: ImgMessage = {
      type: FrameType.IMG,
      width: 33,
      height: 33,
      pixels: new Array(33 * 33).fill(false),
    };
    expect(() => encodeFrame(msg)).toThrow('Invalid width');
  });
});

describe('TXT frame', () => {
  it('encodes and decodes text', () => {
    const msg: TxtMessage = { type: FrameType.TXT, text: 'Hello wavepx!' };
    const frame = encodeFrame(msg);
    expect(frame[0]).toBe(FrameType.TXT);
    expect(frame[1]).toBe(PROTOCOL_VERSION);

    const decoded = decodeFrame(frame) as TxtMessage;
    expect(decoded.type).toBe(FrameType.TXT);
    expect(decoded.text).toBe('Hello wavepx!');
  });

  it('handles UTF-8 text', () => {
    const msg: TxtMessage = { type: FrameType.TXT, text: 'pixel art' };
    const frame = encodeFrame(msg);
    const decoded = decodeFrame(frame) as TxtMessage;
    expect(decoded.text).toBe('pixel art');
  });

  it('rejects text that is too long', () => {
    const msg: TxtMessage = { type: FrameType.TXT, text: 'x'.repeat(139) };
    expect(() => encodeFrame(msg)).toThrow('Text too long');
  });
});

describe('decodeFrame error handling', () => {
  it('rejects empty frame', () => {
    expect(() => decodeFrame(new Uint8Array([]))).toThrow('Frame too short');
  });

  it('rejects unknown frame type', () => {
    expect(() => decodeFrame(new Uint8Array([0xff, 0x01]))).toThrow('Unknown frame type');
  });
});
