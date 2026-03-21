import { describe, it, expect } from 'vitest';
import {
  encodeTransferFrame, decodeTransferFrame, computeCrc32,
  TransferSubtype, DoneStatus, AbortReason,
  type SynMessage, type DataMessage, type DoneMessage,
} from '../lib/transfer-protocol.js';
import { TransferSenderSession, TransferReceiverSession } from '../lib/transfer-session.js';

describe('CRC-32 edge cases', () => {
  it('produces non-zero for all-zero data', () => {
    const crc = computeCrc32(new Uint8Array(100));
    expect(crc).not.toBe(0);
  });

  it('single byte CRC', () => {
    const crc = computeCrc32(new Uint8Array([0x42]));
    expect(crc).toBeGreaterThan(0);
  });

  it('different data produces different CRCs', () => {
    const crc1 = computeCrc32(new Uint8Array([1, 2, 3]));
    const crc2 = computeCrc32(new Uint8Array([1, 2, 4]));
    expect(crc1).not.toBe(crc2);
  });

  it('CRC detects single bit flip', () => {
    const data = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
    const crc1 = computeCrc32(data);
    data[2] = 0x01; // flip one bit
    const crc2 = computeCrc32(data);
    expect(crc1).not.toBe(crc2);
  });

  it('CRC is unsigned 32-bit', () => {
    const crc = computeCrc32(new Uint8Array(1000).fill(0xFF));
    expect(crc).toBeGreaterThanOrEqual(0);
    expect(crc).toBeLessThanOrEqual(0xFFFFFFFF);
  });
});

describe('SYN frame advanced', () => {
  it('preserves all fields through roundtrip', () => {
    const syn: SynMessage = {
      subtype: TransferSubtype.SYN,
      sessionId: 42,
      compressed: true,
      originalSize: 50000,
      compressedSize: 30000,
      blockSize: 130,
      sourceBlockCount: 231,
      totalBlockCount: 347,
      crc32: 0xDEADBEEF,
      fileName: 'test-file.txt',
    };

    const frame = encodeTransferFrame(syn);
    const decoded = decodeTransferFrame(frame) as SynMessage;

    expect(decoded.sessionId).toBe(42);
    expect(decoded.compressed).toBe(true);
    expect(decoded.originalSize).toBe(50000);
    expect(decoded.compressedSize).toBe(30000);
    expect(decoded.blockSize).toBe(130);
    expect(decoded.sourceBlockCount).toBe(231);
    expect(decoded.totalBlockCount).toBe(347);
    expect(decoded.crc32).toBe(0xDEADBEEF);
    expect(decoded.fileName).toBe('test-file.txt');
  });

  it('handles empty filename', () => {
    const syn: SynMessage = {
      subtype: TransferSubtype.SYN,
      sessionId: 1,
      compressed: false,
      originalSize: 100,
      compressedSize: 100,
      blockSize: 130,
      sourceBlockCount: 1,
      totalBlockCount: 2,
      crc32: 0,
      fileName: '',
    };

    const frame = encodeTransferFrame(syn);
    const decoded = decodeTransferFrame(frame) as SynMessage;
    expect(decoded.fileName).toBe('');
  });
});

describe('DATA frame advanced', () => {
  it('roundtrips data with degree 1 (systematic)', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const msg: DataMessage = {
      subtype: TransferSubtype.DATA,
      sessionId: 10,
      blockIndex: 0,
      degree: 1,
      sourceIndices: [0],
      payload,
    };

    const frame = encodeTransferFrame(msg);
    const decoded = decodeTransferFrame(frame) as DataMessage;
    expect(decoded.blockIndex).toBe(0);
    expect(decoded.degree).toBe(1);
    expect(decoded.sourceIndices).toEqual([0]);
    expect(Array.from(decoded.payload)).toEqual([1, 2, 3, 4, 5]);
  });

  it('roundtrips data with degree 3 (parity)', () => {
    const payload = new Uint8Array(130);
    for (let i = 0; i < 130; i++) payload[i] = i & 0xFF;

    const msg: DataMessage = {
      subtype: TransferSubtype.DATA,
      sessionId: 5,
      blockIndex: 10,
      degree: 3,
      sourceIndices: [0, 3, 7],
      payload,
    };

    const frame = encodeTransferFrame(msg);
    const decoded = decodeTransferFrame(frame) as DataMessage;
    expect(decoded.degree).toBe(3);
    expect(decoded.sourceIndices).toEqual([0, 3, 7]);
    expect(decoded.payload.length).toBe(130);
  });
});

describe('ABORT frame', () => {
  it('roundtrips all abort reasons', () => {
    for (const reason of [AbortReason.UserCancel, AbortReason.Timeout, AbortReason.Error]) {
      const frame = encodeTransferFrame({
        subtype: TransferSubtype.ABORT,
        sessionId: 1,
        reason,
      });
      const decoded = decodeTransferFrame(frame);
      expect(decoded.subtype).toBe(TransferSubtype.ABORT);
      if (decoded.subtype === TransferSubtype.ABORT) {
        expect(decoded.reason).toBe(reason);
      }
    }
  });
});

describe('TransferSenderSession advanced', () => {
  it('prepare() computes correct block counts', async () => {
    const data = new Uint8Array(300);
    const session = new TransferSenderSession(data.buffer, 'test.bin');
    await session.prepare();

    expect(session.getState()).toBe('awaiting-syn-ack');
    expect(session.getOriginalSize()).toBe(300);
    expect(session.getTotalFrames()).toBeGreaterThan(0);
  });

  it('getSynFrame() contains valid SYN message', async () => {
    const data = new Uint8Array(100);
    for (let i = 0; i < 100; i++) data[i] = i;
    const session = new TransferSenderSession(data.buffer, 'numbers.bin');
    await session.prepare();

    const synFrame = session.getSynFrame();
    const syn = decodeTransferFrame(synFrame) as SynMessage;
    expect(syn.subtype).toBe(TransferSubtype.SYN);
    expect(syn.fileName).toBe('numbers.bin');
    expect(syn.originalSize).toBe(100);
    expect(syn.sourceBlockCount).toBeGreaterThan(0);
    expect(syn.totalBlockCount).toBeGreaterThan(syn.sourceBlockCount);
  });

  it('data frames are valid DATA messages', async () => {
    const data = new Uint8Array(50);
    const session = new TransferSenderSession(data.buffer, 'test.bin');
    await session.prepare();

    const dataFrames = session.getDataFrames();
    for (const frame of dataFrames) {
      const msg = decodeTransferFrame(frame);
      expect(msg.subtype).toBe(TransferSubtype.DATA);
    }
  });

  it('onSynAck rejects wrong session ID', async () => {
    const session = new TransferSenderSession(new Uint8Array(10).buffer, 'test.bin');
    await session.prepare();

    const wrongId = (session.getSessionId() + 1) % 256;
    expect(session.onSynAck({ subtype: TransferSubtype.SYN_ACK, sessionId: wrongId })).toBe(false);
    expect(session.getState()).toBe('awaiting-syn-ack');
  });

  it('onSynAck accepts correct session ID', async () => {
    const session = new TransferSenderSession(new Uint8Array(10).buffer, 'test.bin');
    await session.prepare();

    expect(session.onSynAck({
      subtype: TransferSubtype.SYN_ACK,
      sessionId: session.getSessionId(),
    })).toBe(true);
    expect(session.getState()).toBe('sending');
  });

  it('full lifecycle: prepare → synack → send → done', async () => {
    const data = new Uint8Array(50);
    for (let i = 0; i < 50; i++) data[i] = i;
    const session = new TransferSenderSession(data.buffer, 'test.bin');

    expect(session.getState()).toBe('idle');
    await session.prepare();
    expect(session.getState()).toBe('awaiting-syn-ack');

    session.onSynAck({ subtype: TransferSubtype.SYN_ACK, sessionId: session.getSessionId() });
    expect(session.getState()).toBe('sending');

    session.markAwaitingDone();
    expect(session.getState()).toBe('awaiting-done');

    session.onDone({ subtype: TransferSubtype.DONE, sessionId: session.getSessionId(), status: DoneStatus.Success });
    expect(session.getState()).toBe('complete');
  });

  it('CRC mismatch sets error state', async () => {
    const session = new TransferSenderSession(new Uint8Array(10).buffer, 'test.bin');
    await session.prepare();
    session.onSynAck({ subtype: TransferSubtype.SYN_ACK, sessionId: session.getSessionId() });
    session.markAwaitingDone();
    session.onDone({
      subtype: TransferSubtype.DONE,
      sessionId: session.getSessionId(),
      status: DoneStatus.CrcMismatch,
    });
    expect(session.getState()).toBe('error');
    expect(session.getError()).toContain('CRC');
  });

  it('markError sets error state with message', async () => {
    const session = new TransferSenderSession(new Uint8Array(10).buffer, 'test.bin');
    session.markError('something went wrong');
    expect(session.getState()).toBe('error');
    expect(session.getError()).toBe('something went wrong');
  });
});

describe('TransferReceiverSession advanced', () => {
  it('onSyn initializes decoder and returns SYN_ACK', async () => {
    const receiver = new TransferReceiverSession();
    expect(receiver.getState()).toBe('idle');

    const syn: SynMessage = {
      subtype: TransferSubtype.SYN,
      sessionId: 42,
      compressed: false,
      originalSize: 100,
      compressedSize: 100,
      blockSize: 130,
      sourceBlockCount: 1,
      totalBlockCount: 2,
      crc32: 0,
      fileName: 'test.bin',
    };

    const synAckFrame = receiver.onSyn(syn);
    expect(receiver.getState()).toBe('receiving');
    expect(receiver.getFileName()).toBe('test.bin');
    expect(receiver.getOriginalSize()).toBe(100);

    const synAck = decodeTransferFrame(synAckFrame);
    expect(synAck.subtype).toBe(TransferSubtype.SYN_ACK);
    if (synAck.subtype === TransferSubtype.SYN_ACK) {
      expect(synAck.sessionId).toBe(42);
    }
  });

  it('onData rejects mismatched session ID', () => {
    const receiver = new TransferReceiverSession();
    receiver.onSyn({
      subtype: TransferSubtype.SYN,
      sessionId: 42,
      compressed: false,
      originalSize: 100,
      compressedSize: 100,
      blockSize: 130,
      sourceBlockCount: 1,
      totalBlockCount: 2,
      crc32: 0,
      fileName: 'test.bin',
    });

    const result = receiver.onData({
      subtype: TransferSubtype.DATA,
      sessionId: 99, // wrong
      blockIndex: 0,
      degree: 1,
      sourceIndices: [0],
      payload: new Uint8Array(130),
    });
    expect(result).toBe(false);
  });

  it('verify() fails when decoder is not complete', async () => {
    const receiver = new TransferReceiverSession();
    receiver.onSyn({
      subtype: TransferSubtype.SYN,
      sessionId: 1,
      compressed: false,
      originalSize: 100,
      compressedSize: 100,
      blockSize: 50,
      sourceBlockCount: 2,
      totalBlockCount: 3,
      crc32: 0,
      fileName: 'test.bin',
    });

    // Don't send any data
    const doneFrame = await receiver.verify();
    const done = decodeTransferFrame(doneFrame) as DoneMessage;
    expect(done.status).toBe(DoneStatus.CrcMismatch);
    expect(receiver.getState()).toBe('error');
  });

  it('getFile() returns null before completion', () => {
    const receiver = new TransferReceiverSession();
    expect(receiver.getFile()).toBeNull();
  });

  it('progress starts at 0', () => {
    const receiver = new TransferReceiverSession();
    expect(receiver.getProgress()).toBe(0);
  });
});

describe('full sender → receiver roundtrip advanced', () => {
  it('transfers binary data with various byte values', async () => {
    const data = new Uint8Array(256);
    for (let i = 0; i < 256; i++) data[i] = i; // all byte values 0-255

    const sender = new TransferSenderSession(data.buffer, 'bytes.bin');
    await sender.prepare();

    const synFrame = sender.getSynFrame();
    const syn = decodeTransferFrame(synFrame) as SynMessage;

    const receiver = new TransferReceiverSession();
    receiver.onSyn(syn);
    sender.onSynAck({ subtype: TransferSubtype.SYN_ACK, sessionId: sender.getSessionId() });

    const dataFrames = sender.getDataFrames();
    for (const frame of dataFrames) {
      const msg = decodeTransferFrame(frame) as DataMessage;
      receiver.onData(msg);
    }

    const doneFrame = await receiver.verify();
    const done = decodeTransferFrame(doneFrame) as DoneMessage;
    expect(done.status).toBe(DoneStatus.Success);

    const file = receiver.getFile();
    expect(file).not.toBeNull();
    expect(file!.name).toBe('bytes.bin');
    expect(Array.from(file!.data)).toEqual(Array.from(data));
  });

  it('transfers 1-byte file', async () => {
    const data = new Uint8Array([0x42]);
    const sender = new TransferSenderSession(data.buffer, 'single.bin');
    await sender.prepare();

    const receiver = new TransferReceiverSession();
    receiver.onSyn(decodeTransferFrame(sender.getSynFrame()) as SynMessage);
    sender.onSynAck({ subtype: TransferSubtype.SYN_ACK, sessionId: sender.getSessionId() });

    for (const frame of sender.getDataFrames()) {
      receiver.onData(decodeTransferFrame(frame) as DataMessage);
    }

    const doneFrame = await receiver.verify();
    const done = decodeTransferFrame(doneFrame) as DoneMessage;
    expect(done.status).toBe(DoneStatus.Success);

    const file = receiver.getFile();
    expect(file!.data.length).toBe(1);
    expect(file!.data[0]).toBe(0x42);
  });

  it('transfers data at exactly 64KB - 1 limit', async () => {
    const data = new Uint8Array(65535);
    for (let i = 0; i < data.length; i++) data[i] = i & 0xFF;
    const sender = new TransferSenderSession(data.buffer, 'max.bin');
    await sender.prepare();
    expect(sender.getState()).toBe('awaiting-syn-ack');
  });

  it('rejects file over 64KB', async () => {
    const data = new Uint8Array(65536);
    const sender = new TransferSenderSession(data.buffer, 'toobig.bin');
    await sender.prepare();
    expect(sender.getState()).toBe('error');
    expect(sender.getError()).toContain('too large');
  });

  it('receiver progress increases with blocks', async () => {
    const data = new Uint8Array(500);
    for (let i = 0; i < 500; i++) data[i] = i & 0xFF;

    const sender = new TransferSenderSession(data.buffer, 'test.bin');
    await sender.prepare();

    const syn = decodeTransferFrame(sender.getSynFrame()) as SynMessage;
    const receiver = new TransferReceiverSession();
    receiver.onSyn(syn);

    let lastProgress = 0;
    for (const frame of sender.getDataFrames()) {
      const msg = decodeTransferFrame(frame) as DataMessage;
      receiver.onData(msg);
      const newProgress = receiver.getProgress();
      expect(newProgress).toBeGreaterThanOrEqual(lastProgress);
      lastProgress = newProgress;
    }
    // Progress should reach 1.0 after all blocks
    expect(receiver.getProgress()).toBe(1);
  });
});
