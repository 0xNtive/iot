import { describe, it, expect } from 'vitest';
import { encodeFrame, decodeFrame } from '../lib/protocol.js';
import { FrameType, ECLevel, type QrMessage, type ImgMessage, type TxtMessage } from '../lib/types.js';
import { MAX_PAYLOAD, MAX_TEXT_BYTES, MAX_IMG_DIMENSION } from '../lib/constants.js';
import { createQrMessage } from '../lib/qr.js';

describe('frame type dispatch', () => {
  it('decodeFrame returns "chunk" for type 0x04', () => {
    const data = new Uint8Array([0x04, 0, 1, 0, 0, 0, 0, 0, 0x01, 0]);
    expect(decodeFrame(data)).toBe('chunk');
  });

  it('decodeFrame returns "game" for type 0x05', () => {
    const data = new Uint8Array([0x05, 0x04, 0x01]);
    expect(decodeFrame(data)).toBe('game');
  });

  it('decodeFrame returns "transfer" for type 0x06', () => {
    const data = new Uint8Array([0x06, 0x02, 42, 0x01]);
    expect(decodeFrame(data)).toBe('transfer');
  });

  it('encodeFrame throws for CHUNK type', () => {
    expect(() => encodeFrame({ type: FrameType.CHUNK } as any)).toThrow('Use encodeChunkedImage');
  });

  it('encodeFrame throws for unknown type', () => {
    expect(() => encodeFrame({ type: 99 } as any)).toThrow('Unknown frame type');
  });
});

describe('QR frame edge cases', () => {
  it('encodes and decodes all EC levels', () => {
    for (const ecLevel of [ECLevel.L, ECLevel.M, ECLevel.Q, ECLevel.H]) {
      const msg = createQrMessage('test', { ecLevel });
      const frame = encodeFrame(msg);
      const decoded = decodeFrame(frame) as QrMessage;
      expect(decoded.ecLevel).toBe(ecLevel);
    }
  });

  it('encodes and decodes all QR versions', () => {
    for (const version of [1, 2, 3, 4]) {
      const msg = createQrMessage('A', { version });
      const frame = encodeFrame(msg);
      const decoded = decodeFrame(frame) as QrMessage;
      expect(decoded.version).toBe(version);
    }
  });

  it('preserves QR module data through roundtrip', () => {
    const msg = createQrMessage('Hello World!');
    const frame = encodeFrame(msg);
    const decoded = decodeFrame(frame) as QrMessage;
    expect(decoded.modules.length).toBe(msg.modules.length);
    for (let i = 0; i < msg.modules.length; i++) {
      expect(decoded.modules[i]).toBe(msg.modules[i]);
    }
  });
});

describe('IMG frame edge cases', () => {
  it('encodes minimum size image (1x1)', () => {
    const msg: ImgMessage = {
      type: FrameType.IMG,
      width: 1,
      height: 1,
      pixels: [true],
    };
    const frame = encodeFrame(msg);
    const decoded = decodeFrame(frame) as ImgMessage;
    expect(decoded.width).toBe(1);
    expect(decoded.height).toBe(1);
    expect(decoded.pixels[0]).toBe(true);
  });

  it('encodes maximum size image (32x32)', () => {
    const msg: ImgMessage = {
      type: FrameType.IMG,
      width: 32,
      height: 32,
      pixels: new Array(1024).fill(false).map((_, i) => i % 2 === 0),
    };
    const frame = encodeFrame(msg);
    expect(frame.length).toBeLessThanOrEqual(MAX_PAYLOAD);
    const decoded = decodeFrame(frame) as ImgMessage;
    expect(decoded.width).toBe(32);
    expect(decoded.height).toBe(32);
    expect(decoded.pixels.length).toBe(1024);
  });

  it('rejects width 0', () => {
    const msg: ImgMessage = { type: FrameType.IMG, width: 0, height: 8, pixels: [] };
    expect(() => encodeFrame(msg)).toThrow('Invalid width');
  });

  it('rejects height 0', () => {
    const msg: ImgMessage = { type: FrameType.IMG, width: 8, height: 0, pixels: [] };
    expect(() => encodeFrame(msg)).toThrow('Invalid height');
  });

  it('rejects width > 32', () => {
    const msg: ImgMessage = { type: FrameType.IMG, width: 33, height: 8, pixels: new Array(33 * 8).fill(false) };
    expect(() => encodeFrame(msg)).toThrow('Invalid width');
  });

  it('preserves non-square images', () => {
    const msg: ImgMessage = {
      type: FrameType.IMG,
      width: 16,
      height: 8,
      pixels: new Array(128).fill(false).map((_, i) => i < 64),
    };
    const frame = encodeFrame(msg);
    const decoded = decodeFrame(frame) as ImgMessage;
    expect(decoded.width).toBe(16);
    expect(decoded.height).toBe(8);
    expect(decoded.pixels.slice(0, 64).every(p => p === true)).toBe(true);
    expect(decoded.pixels.slice(64).every(p => p === false)).toBe(true);
  });
});

describe('TXT frame edge cases', () => {
  it('encodes empty text (minimum 1 byte)', () => {
    // Empty text is valid at protocol level
    const msg: TxtMessage = { type: FrameType.TXT, text: 'a' };
    const frame = encodeFrame(msg);
    const decoded = decodeFrame(frame) as TxtMessage;
    expect(decoded.text).toBe('a');
  });

  it('encodes max length text (138 bytes)', () => {
    const text = 'x'.repeat(138);
    const msg: TxtMessage = { type: FrameType.TXT, text };
    const frame = encodeFrame(msg);
    expect(frame.length).toBe(MAX_PAYLOAD);
    const decoded = decodeFrame(frame) as TxtMessage;
    expect(decoded.text).toBe(text);
  });

  it('rejects text exceeding 138 bytes', () => {
    const msg: TxtMessage = { type: FrameType.TXT, text: 'x'.repeat(139) };
    expect(() => encodeFrame(msg)).toThrow('Text too long');
  });

  it('handles multibyte UTF-8 characters', () => {
    const msg: TxtMessage = { type: FrameType.TXT, text: 'Hello!' };
    const frame = encodeFrame(msg);
    const decoded = decodeFrame(frame) as TxtMessage;
    expect(decoded.text).toBe('Hello!');
  });

  it('handles emoji (4-byte UTF-8)', () => {
    const msg: TxtMessage = { type: FrameType.TXT, text: 'Hi' };
    const frame = encodeFrame(msg);
    const decoded = decodeFrame(frame) as TxtMessage;
    expect(decoded.text).toBe('Hi');
  });

  it('handles CJK characters (3-byte UTF-8)', () => {
    const msg: TxtMessage = { type: FrameType.TXT, text: 'wavepx' };
    const frame = encodeFrame(msg);
    const decoded = decodeFrame(frame) as TxtMessage;
    expect(decoded.text).toBe('wavepx');
  });
});

describe('decodeFrame error cases', () => {
  it('rejects single-byte frame', () => {
    expect(() => decodeFrame(new Uint8Array([0x01]))).toThrow('Frame too short');
  });

  it('rejects zero-byte frame', () => {
    expect(() => decodeFrame(new Uint8Array([]))).toThrow('Frame too short');
  });

  it('rejects unknown frame type 0x99', () => {
    expect(() => decodeFrame(new Uint8Array([0x99, 0x00]))).toThrow('Unknown frame type');
  });
});
