import { describe, it, expect } from 'vitest';
import { encodeFrame, decodeFrame } from '../lib/protocol.js';
import { createQrMessage } from '../lib/qr.js';
import { packBits, unpackBits } from '../lib/bitpack.js';
import { FrameType, ECLevel, type ImgMessage, type TxtMessage, type QrMessage } from '../lib/types.js';
import { MAX_PAYLOAD } from '../lib/constants.js';

describe('full encode/decode roundtrip', () => {
  it('QR: text → QR message → frame → decode → matching modules', () => {
    const qrMsg = createQrMessage('wavepx test');
    const frame = encodeFrame(qrMsg);
    expect(frame.length).toBeLessThanOrEqual(MAX_PAYLOAD);

    const decoded = decodeFrame(frame) as QrMessage;
    expect(decoded.type).toBe(FrameType.QR);
    expect(decoded.modules.length).toBe(qrMsg.modules.length);
    expect(decoded.modules).toEqual(qrMsg.modules);
  });

  it('IMG: pixel art → frame → decode → matching pixels', () => {
    // Create a simple smiley face pattern on 8x8
    const pixels = new Array(64).fill(false);
    // Eyes
    pixels[1 * 8 + 2] = true;
    pixels[1 * 8 + 5] = true;
    // Mouth
    pixels[5 * 8 + 1] = true;
    pixels[5 * 8 + 6] = true;
    pixels[6 * 8 + 2] = true;
    pixels[6 * 8 + 3] = true;
    pixels[6 * 8 + 4] = true;
    pixels[6 * 8 + 5] = true;

    const msg: ImgMessage = {
      type: FrameType.IMG,
      width: 8,
      height: 8,
      pixels,
    };

    const frame = encodeFrame(msg);
    const decoded = decodeFrame(frame) as ImgMessage;
    expect(decoded.width).toBe(8);
    expect(decoded.height).toBe(8);
    expect(decoded.pixels).toEqual(pixels);
  });

  it('TXT: text → frame → decode → matching text', () => {
    const msg: TxtMessage = { type: FrameType.TXT, text: 'Hello from wavepx!' };
    const frame = encodeFrame(msg);
    const decoded = decodeFrame(frame) as TxtMessage;
    expect(decoded.text).toBe('Hello from wavepx!');
  });

  it('all frame types fit within MAX_PAYLOAD', () => {
    // QR v1
    const qr1 = createQrMessage('A');
    expect(encodeFrame(qr1).length).toBeLessThanOrEqual(MAX_PAYLOAD);

    // Max image 32x32
    const img: ImgMessage = {
      type: FrameType.IMG,
      width: 32,
      height: 32,
      pixels: new Array(1024).fill(true),
    };
    expect(encodeFrame(img).length).toBeLessThanOrEqual(MAX_PAYLOAD);

    // Max text
    const txt: TxtMessage = { type: FrameType.TXT, text: 'a'.repeat(138) };
    expect(encodeFrame(txt).length).toBeLessThanOrEqual(MAX_PAYLOAD);
  });
});

describe('bitpack with protocol sizes', () => {
  it('21x21 QR packs to 56 bytes', () => {
    const bits = new Array(441).fill(true);
    const packed = packBits(bits);
    expect(packed.length).toBe(56);
  });

  it('25x25 QR packs to 79 bytes', () => {
    const bits = new Array(625).fill(true);
    const packed = packBits(bits);
    expect(packed.length).toBe(79);
  });

  it('29x29 QR packs to 106 bytes', () => {
    const bits = new Array(841).fill(true);
    const packed = packBits(bits);
    expect(packed.length).toBe(106);
  });

  it('33x33 QR packs to 137 bytes', () => {
    const bits = new Array(1089).fill(true);
    const packed = packBits(bits);
    expect(packed.length).toBe(137);
  });
});
