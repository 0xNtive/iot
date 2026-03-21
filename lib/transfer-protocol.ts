/**
 * Transfer protocol — reliable file transfer over audio with fountain codes.
 *
 * Frame type 0x06, subtypes:
 *   SYN      (0x01): initiate transfer with file metadata — variable length
 *   SYN_ACK  (0x02): receiver acknowledges — 4 bytes
 *   DATA     (0x03): fountain-coded data block — variable length
 *   DONE     (0x04): receiver signals completion — 4 bytes
 *   ABORT    (0x05): either side aborts — 4 bytes
 */

export const TRANSFER_FRAME_TYPE = 0x06;

export const enum TransferSubtype {
  SYN = 0x01,
  SYN_ACK = 0x02,
  DATA = 0x03,
  DONE = 0x04,
  ABORT = 0x05,
}

export const enum DoneStatus {
  Success = 0x00,
  CrcMismatch = 0x01,
}

export const enum AbortReason {
  UserCancel = 0x00,
  Timeout = 0x01,
  Error = 0x02,
}

export interface SynMessage {
  subtype: TransferSubtype.SYN;
  sessionId: number;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
  blockSize: number;
  sourceBlockCount: number;
  totalBlockCount: number;
  crc32: number;
  fileName: string;
}

export interface SynAckMessage {
  subtype: TransferSubtype.SYN_ACK;
  sessionId: number;
}

export interface DataMessage {
  subtype: TransferSubtype.DATA;
  sessionId: number;
  blockIndex: number;
  degree: number;
  sourceIndices: number[];
  payload: Uint8Array;
}

export interface DoneMessage {
  subtype: TransferSubtype.DONE;
  sessionId: number;
  status: DoneStatus;
}

export interface AbortMessage {
  subtype: TransferSubtype.ABORT;
  sessionId: number;
  reason: AbortReason;
}

export type TransferMessage = SynMessage | SynAckMessage | DataMessage | DoneMessage | AbortMessage;

// --- CRC-32 (IEEE 802.3) ---

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

export function computeCrc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// --- Encode ---

export function encodeTransferFrame(msg: TransferMessage): Uint8Array {
  switch (msg.subtype) {
    case TransferSubtype.SYN: {
      const nameBytes = new TextEncoder().encode(msg.fileName);
      const nameLen = Math.min(nameBytes.length, 122); // fit in 140 total (18 + nameLen)
      const frame = new Uint8Array(18 + nameLen);
      frame[0] = TRANSFER_FRAME_TYPE;
      frame[1] = TransferSubtype.SYN;
      frame[2] = msg.sessionId & 0xFF;
      frame[3] = msg.compressed ? 0x80 : 0x00;
      frame[4] = (msg.originalSize >>> 8) & 0xFF;
      frame[5] = msg.originalSize & 0xFF;
      frame[6] = (msg.compressedSize >>> 8) & 0xFF;
      frame[7] = msg.compressedSize & 0xFF;
      frame[8] = msg.blockSize & 0xFF;
      frame[9] = (msg.sourceBlockCount >>> 8) & 0xFF;
      frame[10] = msg.sourceBlockCount & 0xFF;
      frame[11] = (msg.totalBlockCount >>> 8) & 0xFF;
      frame[12] = msg.totalBlockCount & 0xFF;
      frame[13] = (msg.crc32 >>> 24) & 0xFF;
      frame[14] = (msg.crc32 >>> 16) & 0xFF;
      frame[15] = (msg.crc32 >>> 8) & 0xFF;
      frame[16] = msg.crc32 & 0xFF;
      frame[17] = nameLen;
      frame.set(nameBytes.subarray(0, nameLen), 18);
      return frame;
    }
    case TransferSubtype.SYN_ACK: {
      const frame = new Uint8Array(4);
      frame[0] = TRANSFER_FRAME_TYPE;
      frame[1] = TransferSubtype.SYN_ACK;
      frame[2] = msg.sessionId & 0xFF;
      frame[3] = 0x01; // version
      return frame;
    }
    case TransferSubtype.DATA: {
      const headerSize = 5 + msg.degree;
      const frame = new Uint8Array(headerSize + msg.payload.length);
      frame[0] = TRANSFER_FRAME_TYPE;
      frame[1] = TransferSubtype.DATA;
      frame[2] = msg.sessionId & 0xFF;
      frame[3] = msg.blockIndex & 0xFF;
      frame[4] = msg.degree & 0xFF;
      for (let i = 0; i < msg.degree; i++) {
        frame[5 + i] = msg.sourceIndices[i] & 0xFF;
      }
      frame.set(msg.payload, headerSize);
      return frame;
    }
    case TransferSubtype.DONE: {
      const frame = new Uint8Array(4);
      frame[0] = TRANSFER_FRAME_TYPE;
      frame[1] = TransferSubtype.DONE;
      frame[2] = msg.sessionId & 0xFF;
      frame[3] = msg.status;
      return frame;
    }
    case TransferSubtype.ABORT: {
      const frame = new Uint8Array(4);
      frame[0] = TRANSFER_FRAME_TYPE;
      frame[1] = TransferSubtype.ABORT;
      frame[2] = msg.sessionId & 0xFF;
      frame[3] = msg.reason;
      return frame;
    }
  }
}

// --- Decode ---

export function decodeTransferFrame(data: Uint8Array): TransferMessage {
  if (data.length < 3) throw new Error('Transfer frame too short');
  if (data[0] !== TRANSFER_FRAME_TYPE) throw new Error('Not a transfer frame');

  const subtype = data[1];
  switch (subtype) {
    case TransferSubtype.SYN: {
      if (data.length < 18) throw new Error('SYN frame too short');
      const nameLen = data[17];
      const nameBytes = data.slice(18, 18 + nameLen);
      return {
        subtype: TransferSubtype.SYN,
        sessionId: data[2],
        compressed: (data[3] & 0x80) !== 0,
        originalSize: ((data[4] << 8) | data[5]) >>> 0,
        compressedSize: ((data[6] << 8) | data[7]) >>> 0,
        blockSize: data[8],
        sourceBlockCount: ((data[9] << 8) | data[10]) >>> 0,
        totalBlockCount: ((data[11] << 8) | data[12]) >>> 0,
        crc32: ((data[13] << 24) | (data[14] << 16) | (data[15] << 8) | data[16]) >>> 0,
        fileName: new TextDecoder().decode(nameBytes),
      };
    }
    case TransferSubtype.SYN_ACK: {
      if (data.length < 3) throw new Error('SYN_ACK frame too short');
      return {
        subtype: TransferSubtype.SYN_ACK,
        sessionId: data[2],
      };
    }
    case TransferSubtype.DATA: {
      if (data.length < 6) throw new Error('DATA frame too short');
      const degree = data[4];
      if (data.length < 5 + degree) throw new Error('DATA frame missing source indices');
      const sourceIndices: number[] = [];
      for (let i = 0; i < degree; i++) {
        sourceIndices.push(data[5 + i]);
      }
      const payload = data.slice(5 + degree);
      return {
        subtype: TransferSubtype.DATA,
        sessionId: data[2],
        blockIndex: data[3],
        degree,
        sourceIndices,
        payload: new Uint8Array(payload),
      };
    }
    case TransferSubtype.DONE: {
      if (data.length < 4) throw new Error('DONE frame too short');
      return {
        subtype: TransferSubtype.DONE,
        sessionId: data[2],
        status: data[3] as DoneStatus,
      };
    }
    case TransferSubtype.ABORT: {
      if (data.length < 4) throw new Error('ABORT frame too short');
      return {
        subtype: TransferSubtype.ABORT,
        sessionId: data[2],
        reason: data[3] as AbortReason,
      };
    }
    default:
      throw new Error(`Unknown transfer subtype: 0x${subtype.toString(16)}`);
  }
}
