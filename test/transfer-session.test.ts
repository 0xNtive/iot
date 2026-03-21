import { describe, it, expect } from 'vitest';
import { TransferSenderSession, TransferReceiverSession } from '../lib/transfer-session.js';
import {
  encodeTransferFrame,
  decodeTransferFrame,
  computeCrc32,
  TransferSubtype,
  DoneStatus,
  TRANSFER_FRAME_TYPE,
  type SynMessage,
  type SynAckMessage,
  type DataMessage,
  type DoneMessage,
} from '../lib/transfer-protocol.js';
import { encodeBlocks, FountainDecoder } from '../lib/fountain.js';

// Helper: create test data of a given size
function makeTestData(size: number): Uint8Array {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) data[i] = i & 0xFF;
  return data;
}

// --- TransferSenderSession ---

describe('TransferSenderSession', () => {
  it('starts in idle state', () => {
    const data = makeTestData(100);
    const session = new TransferSenderSession(data.buffer, 'test.bin');
    expect(session.getState()).toBe('idle');
  });

  it('prepare() transitions to awaiting-syn-ack', async () => {
    const data = makeTestData(100);
    const session = new TransferSenderSession(data.buffer, 'test.bin');
    await session.prepare();
    expect(session.getState()).toBe('awaiting-syn-ack');
  });

  it('prepare() generates a valid SYN frame', async () => {
    const data = makeTestData(200);
    const session = new TransferSenderSession(data.buffer, 'hello.txt');
    await session.prepare();

    const synFrame = session.getSynFrame();
    expect(synFrame[0]).toBe(TRANSFER_FRAME_TYPE);
    expect(synFrame[1]).toBe(TransferSubtype.SYN);

    // Decode the SYN frame and verify fields
    const syn = decodeTransferFrame(synFrame) as SynMessage;
    expect(syn.subtype).toBe(TransferSubtype.SYN);
    expect(syn.sessionId).toBe(session.getSessionId());
    expect(syn.fileName).toBe('hello.txt');
    expect(syn.originalSize).toBe(200);
    // compressedSize <= originalSize; compressed flag reflects whether compression helped
    expect(syn.compressedSize).toBeLessThanOrEqual(200);
    if (syn.compressed) {
      expect(syn.compressedSize).toBeLessThan(200);
    } else {
      expect(syn.compressedSize).toBe(200);
    }
    // CRC is over the (possibly compressed) payload, always nonzero for nonempty data
    expect(syn.crc32).toBeGreaterThan(0);
  });

  it('prepare() generates DATA frames with correct count', async () => {
    const data = makeTestData(500);
    const session = new TransferSenderSession(data.buffer, 'data.bin', { blockSize: 130, redundancy: 0.5 });
    await session.prepare();

    const dataFrames = session.getDataFrames();
    expect(dataFrames.length).toBeGreaterThan(0);
    expect(session.getTotalFrames()).toBe(dataFrames.length);

    // Each DATA frame should be a valid transfer frame
    for (const frame of dataFrames) {
      expect(frame[0]).toBe(TRANSFER_FRAME_TYPE);
      expect(frame[1]).toBe(TransferSubtype.DATA);
      const msg = decodeTransferFrame(frame) as DataMessage;
      expect(msg.subtype).toBe(TransferSubtype.DATA);
      expect(msg.sessionId).toBe(session.getSessionId());
      expect(msg.payload.length).toBeGreaterThan(0);
    }
  });

  it('getSynFrame() throws before prepare()', () => {
    const data = makeTestData(10);
    const session = new TransferSenderSession(data.buffer, 'x');
    expect(() => session.getSynFrame()).toThrow('Not prepared');
  });

  it('getOriginalSize() returns raw data length', async () => {
    const data = makeTestData(300);
    const session = new TransferSenderSession(data.buffer, 'f');
    await session.prepare();
    expect(session.getOriginalSize()).toBe(300);
  });

  it('getCompressedSize() is <= originalSize after prepare', async () => {
    const data = makeTestData(300);
    const session = new TransferSenderSession(data.buffer, 'f');
    await session.prepare();
    expect(session.getCompressedSize()).toBeLessThanOrEqual(300);
    // Compressed flag should match whether size actually shrank
    if (session.getCompressedSize() < 300) {
      expect(session.isCompressed()).toBe(true);
    }
  });

  it('rejects files larger than 64KB', async () => {
    const data = makeTestData(65536);
    const session = new TransferSenderSession(data.buffer, 'big.bin');
    await session.prepare();
    expect(session.getState()).toBe('error');
    expect(session.getError()).toContain('too large');
  });

  it('onSynAck() with correct session ID transitions to sending', async () => {
    const data = makeTestData(50);
    const session = new TransferSenderSession(data.buffer, 'f');
    await session.prepare();

    const ack: SynAckMessage = {
      subtype: TransferSubtype.SYN_ACK,
      sessionId: session.getSessionId(),
    };
    expect(session.onSynAck(ack)).toBe(true);
    expect(session.getState()).toBe('sending');
  });

  it('onSynAck() with wrong session ID returns false', async () => {
    const data = makeTestData(50);
    const session = new TransferSenderSession(data.buffer, 'f');
    await session.prepare();

    const ack: SynAckMessage = {
      subtype: TransferSubtype.SYN_ACK,
      sessionId: (session.getSessionId() + 1) & 0xFF,
    };
    expect(session.onSynAck(ack)).toBe(false);
    expect(session.getState()).toBe('awaiting-syn-ack');
  });

  it('onDone() with success transitions to complete', async () => {
    const data = makeTestData(50);
    const session = new TransferSenderSession(data.buffer, 'f');
    await session.prepare();
    session.markSending();

    const done: DoneMessage = {
      subtype: TransferSubtype.DONE,
      sessionId: session.getSessionId(),
      status: DoneStatus.Success,
    };
    expect(session.onDone(done)).toBe(true);
    expect(session.getState()).toBe('complete');
  });

  it('onDone() with CRC mismatch transitions to error', async () => {
    const data = makeTestData(50);
    const session = new TransferSenderSession(data.buffer, 'f');
    await session.prepare();
    session.markSending();

    const done: DoneMessage = {
      subtype: TransferSubtype.DONE,
      sessionId: session.getSessionId(),
      status: DoneStatus.CrcMismatch,
    };
    expect(session.onDone(done)).toBe(true);
    expect(session.getState()).toBe('error');
    expect(session.getError()).toContain('CRC mismatch');
  });

  it('onDone() with wrong session ID returns false', async () => {
    const data = makeTestData(50);
    const session = new TransferSenderSession(data.buffer, 'f');
    await session.prepare();
    session.markSending();

    const done: DoneMessage = {
      subtype: TransferSubtype.DONE,
      sessionId: (session.getSessionId() + 1) & 0xFF,
      status: DoneStatus.Success,
    };
    expect(session.onDone(done)).toBe(false);
  });

  it('markError() sets error state and message', async () => {
    const data = makeTestData(10);
    const session = new TransferSenderSession(data.buffer, 'f');
    await session.prepare();
    session.markError('something broke');
    expect(session.getState()).toBe('error');
    expect(session.getError()).toBe('something broke');
  });
});

// --- TransferReceiverSession ---

describe('TransferReceiverSession', () => {
  it('starts in idle state', () => {
    const receiver = new TransferReceiverSession();
    expect(receiver.getState()).toBe('idle');
    expect(receiver.getProgress()).toBe(0);
  });

  it('onSyn() returns a valid SYN_ACK frame and transitions to receiving', () => {
    const receiver = new TransferReceiverSession();

    const syn: SynMessage = {
      subtype: TransferSubtype.SYN,
      sessionId: 42,
      compressed: false,
      originalSize: 100,
      compressedSize: 100,
      blockSize: 130,
      sourceBlockCount: 1,
      totalBlockCount: 2,
      crc32: 0x12345678,
      fileName: 'test.txt',
    };

    const synAckFrame = receiver.onSyn(syn);
    expect(receiver.getState()).toBe('receiving');
    expect(receiver.getFileName()).toBe('test.txt');
    expect(receiver.getOriginalSize()).toBe(100);

    // Verify SYN_ACK frame
    expect(synAckFrame[0]).toBe(TRANSFER_FRAME_TYPE);
    expect(synAckFrame[1]).toBe(TransferSubtype.SYN_ACK);
    const synAck = decodeTransferFrame(synAckFrame) as SynAckMessage;
    expect(synAck.subtype).toBe(TransferSubtype.SYN_ACK);
    expect(synAck.sessionId).toBe(42);
  });

  it('onData() rejects mismatched session ID', () => {
    const receiver = new TransferReceiverSession();

    const syn: SynMessage = {
      subtype: TransferSubtype.SYN,
      sessionId: 10,
      compressed: false,
      originalSize: 50,
      compressedSize: 50,
      blockSize: 130,
      sourceBlockCount: 1,
      totalBlockCount: 1,
      crc32: 0,
      fileName: 'x',
    };
    receiver.onSyn(syn);

    const dataMsg: DataMessage = {
      subtype: TransferSubtype.DATA,
      sessionId: 99, // wrong
      blockIndex: 0,
      degree: 1,
      sourceIndices: [0],
      payload: new Uint8Array(130),
    };
    expect(receiver.onData(dataMsg)).toBe(false);
  });

  it('onData() rejects before onSyn()', () => {
    const receiver = new TransferReceiverSession();
    const dataMsg: DataMessage = {
      subtype: TransferSubtype.DATA,
      sessionId: 1,
      blockIndex: 0,
      degree: 1,
      sourceIndices: [0],
      payload: new Uint8Array(10),
    };
    expect(receiver.onData(dataMsg)).toBe(false);
  });

  it('verify() fails when decoder is not complete', async () => {
    const receiver = new TransferReceiverSession();

    // Set up with 2 source blocks but only feed 1
    const data = makeTestData(200);
    const blockSize = 130;
    const k = Math.ceil(200 / blockSize); // 2
    const blocks = encodeBlocks(data, blockSize, 0.5);
    const crc = computeCrc32(data);

    const syn: SynMessage = {
      subtype: TransferSubtype.SYN,
      sessionId: 5,
      compressed: false,
      originalSize: 200,
      compressedSize: 200,
      blockSize,
      sourceBlockCount: k,
      totalBlockCount: blocks.length,
      crc32: crc,
      fileName: 'partial.bin',
    };
    receiver.onSyn(syn);

    // Only feed one block (need 2)
    receiver.onData({
      subtype: TransferSubtype.DATA,
      sessionId: 5,
      blockIndex: blocks[0].index,
      degree: blocks[0].degree,
      sourceIndices: blocks[0].sourceIndices,
      payload: blocks[0].payload,
    });

    const doneFrame = await receiver.verify();
    expect(receiver.getState()).toBe('error');
    expect(receiver.getError()).toContain('not complete');

    const done = decodeTransferFrame(doneFrame) as DoneMessage;
    expect(done.status).toBe(DoneStatus.CrcMismatch);
  });

  it('verify() detects CRC mismatch', async () => {
    const data = makeTestData(50);
    const blockSize = 130;
    const blocks = encodeBlocks(data, blockSize, 0.5);
    const wrongCrc = 0xDEADDEAD; // intentionally wrong

    const receiver = new TransferReceiverSession();
    const syn: SynMessage = {
      subtype: TransferSubtype.SYN,
      sessionId: 7,
      compressed: false,
      originalSize: 50,
      compressedSize: 50,
      blockSize,
      sourceBlockCount: 1,
      totalBlockCount: blocks.length,
      crc32: wrongCrc,
      fileName: 'bad.bin',
    };
    receiver.onSyn(syn);

    // Feed all blocks
    for (const block of blocks) {
      receiver.onData({
        subtype: TransferSubtype.DATA,
        sessionId: 7,
        blockIndex: block.index,
        degree: block.degree,
        sourceIndices: block.sourceIndices,
        payload: block.payload,
      });
    }

    const doneFrame = await receiver.verify();
    expect(receiver.getState()).toBe('error');
    expect(receiver.getError()).toBe('CRC mismatch');

    const done = decodeTransferFrame(doneFrame) as DoneMessage;
    expect(done.status).toBe(DoneStatus.CrcMismatch);
  });
});

// --- Full roundtrip ---

describe('Full sender -> receiver roundtrip', () => {
  it('transfers small data (< 1 block)', async () => {
    const originalData = makeTestData(50);
    const fileName = 'small.bin';

    // Sender prepares
    const sender = new TransferSenderSession(originalData.buffer, fileName);
    await sender.prepare();
    expect(sender.getState()).toBe('awaiting-syn-ack');

    // Decode SYN from sender
    const synFrame = sender.getSynFrame();
    const syn = decodeTransferFrame(synFrame) as SynMessage;
    expect(syn.fileName).toBe(fileName);
    expect(syn.originalSize).toBe(50);

    // Receiver processes SYN
    const receiver = new TransferReceiverSession();
    const synAckFrame = receiver.onSyn(syn);
    expect(receiver.getState()).toBe('receiving');

    // Sender processes SYN_ACK
    const synAck = decodeTransferFrame(synAckFrame) as SynAckMessage;
    expect(sender.onSynAck(synAck)).toBe(true);
    expect(sender.getState()).toBe('sending');

    // Receiver processes all DATA frames
    const dataFrames = sender.getDataFrames();
    for (const frame of dataFrames) {
      const msg = decodeTransferFrame(frame) as DataMessage;
      receiver.onData(msg);
    }

    // Receiver verifies
    const doneFrame = await receiver.verify();
    expect(receiver.getState()).toBe('complete');

    // Sender processes DONE
    const done = decodeTransferFrame(doneFrame) as DoneMessage;
    expect(done.status).toBe(DoneStatus.Success);
    expect(sender.onDone(done)).toBe(true);
    expect(sender.getState()).toBe('complete');

    // Verify received data matches original
    const file = receiver.getFile();
    expect(file).not.toBeNull();
    expect(file!.name).toBe(fileName);
    expect(Array.from(file!.data)).toEqual(Array.from(originalData));
  });

  it('transfers multi-block data (500 bytes)', async () => {
    const originalData = makeTestData(500);
    const fileName = 'medium.dat';

    const sender = new TransferSenderSession(originalData.buffer, fileName, { blockSize: 130, redundancy: 0.5 });
    await sender.prepare();

    const syn = decodeTransferFrame(sender.getSynFrame()) as SynMessage;
    // sourceBlockCount depends on compressedSize, which may be smaller than 500
    expect(syn.sourceBlockCount).toBe(Math.ceil(syn.compressedSize / 130));

    const receiver = new TransferReceiverSession();
    const synAckFrame = receiver.onSyn(syn);
    sender.onSynAck(decodeTransferFrame(synAckFrame) as SynAckMessage);

    // Feed all data frames
    const dataFrames = sender.getDataFrames();
    expect(dataFrames.length).toBeGreaterThan(4); // systematic + parity

    for (const frame of dataFrames) {
      const msg = decodeTransferFrame(frame) as DataMessage;
      receiver.onData(msg);
    }

    const doneFrame = await receiver.verify();
    expect(receiver.getState()).toBe('complete');

    const done = decodeTransferFrame(doneFrame) as DoneMessage;
    expect(done.status).toBe(DoneStatus.Success);

    const file = receiver.getFile();
    expect(file).not.toBeNull();
    expect(file!.name).toBe(fileName);
    expect(Array.from(file!.data)).toEqual(Array.from(originalData));
  });

  it('transfers data with custom block size', async () => {
    const originalData = makeTestData(100);
    const sender = new TransferSenderSession(originalData.buffer, 'custom.bin', { blockSize: 25, redundancy: 1.0 });
    await sender.prepare();

    const syn = decodeTransferFrame(sender.getSynFrame()) as SynMessage;
    expect(syn.blockSize).toBe(25);
    expect(syn.sourceBlockCount).toBe(4); // 100 / 25

    const receiver = new TransferReceiverSession();
    const synAckFrame = receiver.onSyn(syn);
    sender.onSynAck(decodeTransferFrame(synAckFrame) as SynAckMessage);

    for (const frame of sender.getDataFrames()) {
      const msg = decodeTransferFrame(frame) as DataMessage;
      receiver.onData(msg);
    }

    const doneFrame = await receiver.verify();
    expect(receiver.getState()).toBe('complete');

    const file = receiver.getFile();
    expect(Array.from(file!.data)).toEqual(Array.from(originalData));
  });

  it('receiver progress increases as blocks arrive', async () => {
    const originalData = makeTestData(260);
    const sender = new TransferSenderSession(originalData.buffer, 'prog.bin', { blockSize: 130, redundancy: 0.5 });
    await sender.prepare();

    const syn = decodeTransferFrame(sender.getSynFrame()) as SynMessage;
    const receiver = new TransferReceiverSession();
    receiver.onSyn(syn);

    expect(receiver.getProgress()).toBe(0);

    const dataFrames = sender.getDataFrames();
    // Feed only systematic blocks (first k)
    const firstMsg = decodeTransferFrame(dataFrames[0]) as DataMessage;
    receiver.onData(firstMsg);
    expect(receiver.getProgress()).toBe(0.5); // 1 of 2

    const secondMsg = decodeTransferFrame(dataFrames[1]) as DataMessage;
    receiver.onData(secondMsg);
    expect(receiver.getProgress()).toBe(1); // 2 of 2
  });

  it('handles single-byte file', async () => {
    const originalData = new Uint8Array([0x42]);
    const sender = new TransferSenderSession(originalData.buffer, 'byte.bin');
    await sender.prepare();

    const syn = decodeTransferFrame(sender.getSynFrame()) as SynMessage;
    const receiver = new TransferReceiverSession();
    receiver.onSyn(syn);

    for (const frame of sender.getDataFrames()) {
      receiver.onData(decodeTransferFrame(frame) as DataMessage);
    }

    const doneFrame = await receiver.verify();
    expect(receiver.getState()).toBe('complete');

    const file = receiver.getFile();
    expect(file!.data.length).toBe(1);
    expect(file!.data[0]).toBe(0x42);
  });

  it('getFile() returns null before completion', () => {
    const receiver = new TransferReceiverSession();
    expect(receiver.getFile()).toBeNull();
  });

  it('CRC is consistent between sender and receiver', async () => {
    const originalData = makeTestData(300);
    const sender = new TransferSenderSession(originalData.buffer, 'crc.bin');
    await sender.prepare();

    const syn = decodeTransferFrame(sender.getSynFrame()) as SynMessage;
    // CRC is computed on the (possibly compressed) payload, not the raw data.
    // We verify it's a valid non-zero CRC and that a full roundtrip succeeds.
    expect(syn.crc32).toBeGreaterThan(0);

    // Full roundtrip verifies CRC consistency
    const receiver = new TransferReceiverSession();
    receiver.onSyn(syn);
    for (const frame of sender.getDataFrames()) {
      receiver.onData(decodeTransferFrame(frame) as DataMessage);
    }
    const doneFrame = await receiver.verify();
    const done = decodeTransferFrame(doneFrame) as DoneMessage;
    expect(done.status).toBe(DoneStatus.Success);
    expect(receiver.getState()).toBe('complete');
  });
});

// --- Error cases ---

describe('Error cases', () => {
  it('sender rejects file over 64KB', async () => {
    const data = new Uint8Array(65536); // exactly at limit (> 65535)
    const session = new TransferSenderSession(data.buffer, 'toobig.bin');
    await session.prepare();
    expect(session.getState()).toBe('error');
    expect(session.getError()).toContain('too large');
  });

  it('sender at exactly 65535 bytes succeeds', async () => {
    const data = new Uint8Array(65535);
    const session = new TransferSenderSession(data.buffer, 'maxsize.bin');
    await session.prepare();
    expect(session.getState()).toBe('awaiting-syn-ack');
  });

  it('receiver session ID mismatch in onData rejects silently', async () => {
    const data = makeTestData(50);
    const sender = new TransferSenderSession(data.buffer, 'x');
    await sender.prepare();

    const syn = decodeTransferFrame(sender.getSynFrame()) as SynMessage;
    const receiver = new TransferReceiverSession();
    receiver.onSyn(syn);

    // Tamper with session ID in data message
    const frame = sender.getDataFrames()[0];
    const msg = decodeTransferFrame(frame) as DataMessage;
    const tamperedMsg: DataMessage = {
      ...msg,
      sessionId: (msg.sessionId + 1) & 0xFF,
    };

    const accepted = receiver.onData(tamperedMsg);
    expect(accepted).toBe(false);
  });

  it('CRC mismatch produces error DONE frame', async () => {
    const data = makeTestData(100);
    const sender = new TransferSenderSession(data.buffer, 'f');
    await sender.prepare();

    const syn = decodeTransferFrame(sender.getSynFrame()) as SynMessage;

    // Tamper with CRC in SYN message
    const tamperedSyn: SynMessage = { ...syn, crc32: (syn.crc32 ^ 0xFFFFFFFF) >>> 0 };

    const receiver = new TransferReceiverSession();
    receiver.onSyn(tamperedSyn);

    for (const frame of sender.getDataFrames()) {
      receiver.onData(decodeTransferFrame(frame) as DataMessage);
    }

    const doneFrame = await receiver.verify();
    expect(receiver.getState()).toBe('error');

    const done = decodeTransferFrame(doneFrame) as DoneMessage;
    expect(done.status).toBe(DoneStatus.CrcMismatch);
    expect(receiver.getError()).toBe('CRC mismatch');

    // Sender gets CRC mismatch DONE
    expect(sender.onDone(done)).toBe(true);
    expect(sender.getState()).toBe('error');
    expect(sender.getError()).toContain('CRC mismatch');
  });

  it('sender markAwaitingDone() transitions state', async () => {
    const data = makeTestData(10);
    const session = new TransferSenderSession(data.buffer, 'f');
    await session.prepare();
    session.markSending();
    expect(session.getState()).toBe('sending');
    session.markAwaitingDone();
    expect(session.getState()).toBe('awaiting-done');
  });
});
