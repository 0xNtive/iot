import { describe, it, expect } from 'vitest';
import { encodeFrame, decodeFrame } from '../lib/protocol.js';
import { createQrMessage } from '../lib/qr.js';
import {
  encodeChunkedImage, encodeChunkedGrayImage, encodeChunkedPaletteImage,
  decodeChunkFrame, ChunkAssembler,
} from '../lib/chunked.js';
import { quantizeColors, encodePaletteImage, decodePaletteImage } from '../lib/palette.js';
import { ditherImage } from '../lib/dither.js';
import { rleEncode, rleDecode, rleEncodeGray, rleDecodeGray, quantize, dequantize } from '../lib/rle.js';
import { packBits, unpackBits, packValues, unpackValues } from '../lib/bitpack.js';
import { encodeGameFrame, decodeGameFrame, GameSubtype, ShotResult } from '../lib/game-protocol.js';
import { encodeTransferFrame, decodeTransferFrame, computeCrc32, TransferSubtype } from '../lib/transfer-protocol.js';
import { encodeBlocks, FountainDecoder } from '../lib/fountain.js';
import { TransferSenderSession, TransferReceiverSession } from '../lib/transfer-session.js';
import { FrameType, ECLevel, type ImgMessage, type TxtMessage } from '../lib/types.js';
import { MAX_PAYLOAD, MAX_TEXT_BYTES } from '../lib/constants.js';

describe('cross-module integration', () => {
  it('dither → quantize → gray RLE → chunk roundtrip', () => {
    const size = 32;
    // Create a gradient
    const luma = new Float64Array(size * size);
    for (let i = 0; i < size * size; i++) {
      luma[i] = (i / (size * size)) * 255;
    }

    // Dither to 4 levels
    const dithered = ditherImage(luma, size, size, 4, 'floyd-steinberg');
    expect(dithered.length).toBe(size * size);
    expect(dithered.every(v => v >= 0 && v <= 3)).toBe(true);

    // Encode as chunked gray image
    const chunks = encodeChunkedGrayImage(size, size, dithered, 2);

    // Reassemble
    const assembler = new ChunkAssembler();
    let result = null;
    for (const raw of chunks) {
      result = assembler.addChunk(decodeChunkFrame(raw));
    }

    expect(result).not.toBeNull();
    expect(result!.width).toBe(size);
    expect(result!.height).toBe(size);
    expect(result!.pixels).toEqual(dithered);
  });

  it('RGBA → quantizeColors → palette chunks → reassemble', () => {
    const size = 32;
    const rgba = new Uint8Array(size * size * 4);

    // Create 4-color image (quadrants)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const isTop = y < 16;
        const isLeft = x < 16;
        rgba[i * 4] = isTop ? 255 : 0;
        rgba[i * 4 + 1] = isLeft ? 255 : 0;
        rgba[i * 4 + 2] = 0;
        rgba[i * 4 + 3] = 255;
      }
    }

    const palImg = quantizeColors(rgba, size, size, 16);
    const chunks = encodeChunkedPaletteImage(palImg);

    const assembler = new ChunkAssembler();
    let result = null;
    for (const raw of chunks) {
      result = assembler.addChunk(decodeChunkFrame(raw));
    }

    expect(result).not.toBeNull();
    expect(result!.palette).toBeDefined();
    expect(result!.palette!.length).toBeGreaterThanOrEqual(2);
    expect(result!.pixels.length).toBe(size * size);

    // Verify spatial consistency: top-left and bottom-right should differ
    const topLeft = result!.pixels[0];
    const bottomRight = result!.pixels[size * size - 1];
    expect(topLeft).not.toBe(bottomRight);
  });

  it('bitpack + RLE compression comparison', () => {
    // Mostly-black image with small white region
    const size = 64;
    const pixels = new Array(size * size).fill(false);
    for (let y = 10; y < 20; y++) {
      for (let x = 10; x < 20; x++) {
        pixels[y * size + x] = true;
      }
    }

    const rawPacked = packBits(pixels);
    const rleEncoded = rleEncode(pixels);

    // RLE should be much smaller for this sparse image
    expect(rleEncoded.length).toBeLessThan(rawPacked.length);

    // Both should roundtrip correctly
    const fromRaw = unpackBits(rawPacked, pixels.length);
    const fromRle = rleDecode(rleEncoded, pixels.length);
    expect(fromRaw).toEqual(pixels);
    expect(fromRle).toEqual(pixels);
  });

  it('full game protocol → frame → decode cycle', () => {
    // Setup
    const setupFrame = encodeGameFrame({ subtype: GameSubtype.SETUP, hash: 0x12345678 });
    const result1 = decodeFrame(setupFrame);
    expect(result1).toBe('game');
    const decodedSetup = decodeGameFrame(setupFrame);
    expect(decodedSetup.subtype).toBe(GameSubtype.SETUP);

    // Shot
    const shotFrame = encodeGameFrame({ subtype: GameSubtype.SHOT, x: 3, y: 5 });
    expect(decodeFrame(shotFrame)).toBe('game');

    // Result
    const resultFrame = encodeGameFrame({
      subtype: GameSubtype.RESULT,
      x: 3, y: 5, result: ShotResult.Hit,
    });
    expect(decodeFrame(resultFrame)).toBe('game');

    // Win
    const winFrame = encodeGameFrame({ subtype: GameSubtype.WIN });
    expect(decodeFrame(winFrame)).toBe('game');
  });

  it('transfer frames correctly dispatched', () => {
    const synFrame = encodeTransferFrame({
      subtype: TransferSubtype.SYN,
      sessionId: 1,
      compressed: false,
      originalSize: 100,
      compressedSize: 100,
      blockSize: 130,
      sourceBlockCount: 1,
      totalBlockCount: 2,
      crc32: 0,
      fileName: 'test.bin',
    });
    expect(decodeFrame(synFrame)).toBe('transfer');
  });

  it('QR frames at all versions fit in MAX_PAYLOAD', () => {
    for (const version of [1, 2, 3, 4]) {
      const msg = createQrMessage('test', { version });
      const frame = encodeFrame(msg);
      expect(frame.length).toBeLessThanOrEqual(MAX_PAYLOAD);
    }
  });
});

describe('stress tests', () => {
  it('encodes and decodes 500 text messages', () => {
    for (let i = 0; i < 500; i++) {
      const text = `message ${i}`;
      const msg: TxtMessage = { type: FrameType.TXT, text };
      const frame = encodeFrame(msg);
      const decoded = decodeFrame(frame) as TxtMessage;
      expect(decoded.text).toBe(text);
    }
  });

  it('encodes and decodes 100 different image sizes', () => {
    for (let w = 1; w <= 10; w++) {
      for (let h = 1; h <= 10; h++) {
        const pixels = new Array(w * h).fill(false).map((_, i) => i % 2 === 0);
        const msg: ImgMessage = {
          type: FrameType.IMG,
          width: w,
          height: h,
          pixels,
        };
        const frame = encodeFrame(msg);
        const decoded = decodeFrame(frame) as ImgMessage;
        expect(decoded.width).toBe(w);
        expect(decoded.height).toBe(h);
        expect(decoded.pixels).toEqual(pixels);
      }
    }
  });

  it('fountain coding handles increasing data sizes', () => {
    for (const size of [10, 50, 100, 500, 1000, 5000]) {
      const data = new Uint8Array(size);
      for (let i = 0; i < size; i++) data[i] = (i * 17) & 0xFF;

      const blockSize = 130;
      const k = Math.ceil(size / blockSize);
      const blocks = encodeBlocks(data, blockSize, 0.5);
      const decoder = new FountainDecoder(k, blockSize, size);

      for (const block of blocks) {
        if (decoder.addBlock(block)) break;
      }

      expect(decoder.isComplete()).toBe(true);
      const recovered = decoder.getDecoded();
      expect(Array.from(recovered)).toEqual(Array.from(data));
    }
  });

  it('CRC-32 is consistent across many computations', () => {
    const data = new Uint8Array(1000);
    for (let i = 0; i < 1000; i++) data[i] = i & 0xFF;
    const expected = computeCrc32(data);

    for (let i = 0; i < 100; i++) {
      expect(computeCrc32(data)).toBe(expected);
    }
  });
});

describe('complete file transfer simulation', () => {
  it('transfers text file end-to-end', async () => {
    const text = 'Hello, this is a test file for wavepx transfer!\n'.repeat(20);
    const data = new TextEncoder().encode(text);

    const sender = new TransferSenderSession(data.buffer, 'hello.txt');
    await sender.prepare();

    const receiver = new TransferReceiverSession();
    const syn = decodeTransferFrame(sender.getSynFrame());
    if (syn.subtype === TransferSubtype.SYN) {
      receiver.onSyn(syn);
    }

    sender.onSynAck({
      subtype: TransferSubtype.SYN_ACK,
      sessionId: sender.getSessionId(),
    });

    for (const frame of sender.getDataFrames()) {
      const msg = decodeTransferFrame(frame);
      if (msg.subtype === TransferSubtype.DATA) {
        receiver.onData(msg);
      }
    }

    const doneFrame = await receiver.verify();
    const done = decodeTransferFrame(doneFrame);
    if (done.subtype === TransferSubtype.DONE) {
      expect(done.status).toBe(0); // Success
    }

    const file = receiver.getFile();
    expect(file).not.toBeNull();
    const receivedText = new TextDecoder().decode(file!.data);
    expect(receivedText).toBe(text);
  });
});

describe('dither integration', () => {
  it('dithering to 2 levels produces valid binary image', () => {
    const size = 16;
    const luma = new Float64Array(size * size);
    for (let i = 0; i < size * size; i++) {
      luma[i] = 128; // mid-gray
    }

    for (const algo of ['none', 'floyd-steinberg', 'atkinson'] as const) {
      const result = ditherImage(luma, size, size, 2, algo);
      expect(result.length).toBe(size * size);
      expect(result.every(v => v === 0 || v === 1)).toBe(true);
    }
  });

  it('dithered image encodes and decodes through chunks', () => {
    const size = 64;
    const luma = new Float64Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        luma[y * size + x] = ((x + y) / (2 * size)) * 255;
      }
    }

    const dithered = ditherImage(luma, size, size, 16, 'atkinson');
    const chunks = encodeChunkedGrayImage(size, size, dithered, 4);

    const assembler = new ChunkAssembler();
    let result = null;
    for (const raw of chunks) {
      result = assembler.addChunk(decodeChunkFrame(raw));
    }

    expect(result).not.toBeNull();
    expect(result!.pixels).toEqual(dithered);
  });
});
