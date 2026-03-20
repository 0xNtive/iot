import { describe, it, expect } from 'vitest';
import {
  encodeTransferFrame,
  decodeTransferFrame,
  computeCrc32,
  TransferSubtype,
  DoneStatus,
  AbortReason,
  TRANSFER_FRAME_TYPE,
  type SynMessage,
  type SynAckMessage,
  type DataMessage,
  type DoneMessage,
  type AbortMessage,
} from '../lib/transfer-protocol.js';

describe('computeCrc32', () => {
  it('returns consistent hash for same data', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    expect(computeCrc32(data)).toBe(computeCrc32(data));
  });

  it('returns different hash for different data', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 4]);
    expect(computeCrc32(a)).not.toBe(computeCrc32(b));
  });

  it('returns 0 for empty data', () => {
    expect(computeCrc32(new Uint8Array(0))).toBe(0);
  });

  it('matches known CRC-32 value', () => {
    // CRC-32 of "123456789" (ASCII)
    const data = new TextEncoder().encode('123456789');
    expect(computeCrc32(data)).toBe(0xCBF43926);
  });
});

describe('SYN frame', () => {
  const syn: SynMessage = {
    subtype: TransferSubtype.SYN,
    sessionId: 42,
    compressed: true,
    originalSize: 5000,
    compressedSize: 1500,
    blockSize: 130,
    sourceBlockCount: 12,
    totalBlockCount: 18,
    crc32: 0xDEADBEEF,
    fileName: 'test.txt',
  };

  it('roundtrips', () => {
    const encoded = encodeTransferFrame(syn);
    expect(encoded[0]).toBe(TRANSFER_FRAME_TYPE);
    expect(encoded[1]).toBe(TransferSubtype.SYN);
    const decoded = decodeTransferFrame(encoded) as SynMessage;
    expect(decoded.subtype).toBe(TransferSubtype.SYN);
    expect(decoded.sessionId).toBe(42);
    expect(decoded.compressed).toBe(true);
    expect(decoded.originalSize).toBe(5000);
    expect(decoded.compressedSize).toBe(1500);
    expect(decoded.blockSize).toBe(130);
    expect(decoded.sourceBlockCount).toBe(12);
    expect(decoded.totalBlockCount).toBe(18);
    expect(decoded.crc32).toBe(0xDEADBEEF);
    expect(decoded.fileName).toBe('test.txt');
  });

  it('handles uncompressed flag', () => {
    const uncompressed = { ...syn, compressed: false };
    const decoded = decodeTransferFrame(encodeTransferFrame(uncompressed)) as SynMessage;
    expect(decoded.compressed).toBe(false);
  });

  it('truncates long filenames', () => {
    const longName = 'a'.repeat(200);
    const msg = { ...syn, fileName: longName };
    const encoded = encodeTransferFrame(msg);
    expect(encoded.length).toBeLessThanOrEqual(140);
  });
});

describe('SYN_ACK frame', () => {
  it('roundtrips', () => {
    const msg: SynAckMessage = {
      subtype: TransferSubtype.SYN_ACK,
      sessionId: 99,
    };
    const encoded = encodeTransferFrame(msg);
    expect(encoded.length).toBe(4);
    const decoded = decodeTransferFrame(encoded) as SynAckMessage;
    expect(decoded.subtype).toBe(TransferSubtype.SYN_ACK);
    expect(decoded.sessionId).toBe(99);
  });
});

describe('DATA frame', () => {
  it('roundtrips systematic block (degree=1)', () => {
    const payload = new Uint8Array([10, 20, 30, 40, 50]);
    const msg: DataMessage = {
      subtype: TransferSubtype.DATA,
      sessionId: 7,
      blockIndex: 3,
      degree: 1,
      sourceIndices: [3],
      payload,
    };
    const encoded = encodeTransferFrame(msg);
    const decoded = decodeTransferFrame(encoded) as DataMessage;
    expect(decoded.subtype).toBe(TransferSubtype.DATA);
    expect(decoded.sessionId).toBe(7);
    expect(decoded.blockIndex).toBe(3);
    expect(decoded.degree).toBe(1);
    expect(decoded.sourceIndices).toEqual([3]);
    expect(Array.from(decoded.payload)).toEqual([10, 20, 30, 40, 50]);
  });

  it('roundtrips parity block (degree=3)', () => {
    const payload = new Uint8Array(130);
    payload.fill(0xAB);
    const msg: DataMessage = {
      subtype: TransferSubtype.DATA,
      sessionId: 5,
      blockIndex: 15,
      degree: 3,
      sourceIndices: [1, 4, 7],
      payload,
    };
    const encoded = encodeTransferFrame(msg);
    expect(encoded.length).toBe(5 + 3 + 130); // header + indices + payload
    const decoded = decodeTransferFrame(encoded) as DataMessage;
    expect(decoded.degree).toBe(3);
    expect(decoded.sourceIndices).toEqual([1, 4, 7]);
    expect(decoded.payload.length).toBe(130);
  });
});

describe('DONE frame', () => {
  it('roundtrips success', () => {
    const msg: DoneMessage = {
      subtype: TransferSubtype.DONE,
      sessionId: 42,
      status: DoneStatus.Success,
    };
    const encoded = encodeTransferFrame(msg);
    expect(encoded.length).toBe(4);
    const decoded = decodeTransferFrame(encoded) as DoneMessage;
    expect(decoded.status).toBe(DoneStatus.Success);
  });

  it('roundtrips CRC mismatch', () => {
    const msg: DoneMessage = {
      subtype: TransferSubtype.DONE,
      sessionId: 42,
      status: DoneStatus.CrcMismatch,
    };
    const decoded = decodeTransferFrame(encodeTransferFrame(msg)) as DoneMessage;
    expect(decoded.status).toBe(DoneStatus.CrcMismatch);
  });
});

describe('ABORT frame', () => {
  it('roundtrips all reasons', () => {
    for (const reason of [AbortReason.UserCancel, AbortReason.Timeout, AbortReason.Error]) {
      const msg: AbortMessage = {
        subtype: TransferSubtype.ABORT,
        sessionId: 1,
        reason,
      };
      const decoded = decodeTransferFrame(encodeTransferFrame(msg)) as AbortMessage;
      expect(decoded.reason).toBe(reason);
    }
  });
});

describe('error handling', () => {
  it('rejects too-short frames', () => {
    expect(() => decodeTransferFrame(new Uint8Array([0x06, 0x01]))).toThrow();
  });

  it('rejects wrong frame type', () => {
    expect(() => decodeTransferFrame(new Uint8Array([0x07, 0x01, 0x00]))).toThrow('Not a transfer frame');
  });

  it('rejects unknown subtype', () => {
    expect(() => decodeTransferFrame(new Uint8Array([0x06, 0xFF, 0x00]))).toThrow('Unknown transfer subtype');
  });
});
