/**
 * Transfer session — manages the send/receive lifecycle for file transfer.
 *
 * Sender: compress → fountain encode → send SYN → wait SYN_ACK → send DATA burst → wait DONE
 * Receiver: receive SYN → send SYN_ACK → collect DATA → verify CRC → send DONE
 */

import { deflateCompress, deflateDecompress, isCompressionAvailable } from './deflate.js';
import { encodeBlocks, FountainDecoder, type EncodedBlock } from './fountain.js';
import {
  encodeTransferFrame,
  computeCrc32,
  TransferSubtype,
  DoneStatus,
  type SynMessage,
  type SynAckMessage,
  type DataMessage,
  type DoneMessage,
  type TransferMessage,
} from './transfer-protocol.js';

const DEFAULT_BLOCK_SIZE = 130;
const DEFAULT_REDUNDANCY = 0.5;

export type SenderState = 'idle' | 'preparing' | 'awaiting-syn-ack' | 'sending' | 'awaiting-done' | 'complete' | 'error';
export type ReceiverState = 'idle' | 'receiving' | 'verifying' | 'complete' | 'error';

export interface TransferOptions {
  blockSize?: number;
  redundancy?: number;
}

// --- Sender Session ---

export class TransferSenderSession {
  private state: SenderState = 'idle';
  private sessionId: number;
  private fileName: string;
  private rawData: Uint8Array;
  private compressedData: Uint8Array | null = null;
  private compressed = false;
  private crc32 = 0;
  private blockSize: number;
  private redundancy: number;
  private encodedBlocks: EncodedBlock[] = [];
  private synFrame: Uint8Array | null = null;
  private dataFrames: Uint8Array[] = [];
  private errorMessage = '';

  constructor(data: ArrayBuffer, fileName: string, options?: TransferOptions) {
    this.sessionId = Math.floor(Math.random() * 256);
    this.fileName = fileName;
    this.rawData = new Uint8Array(data);
    this.blockSize = options?.blockSize ?? DEFAULT_BLOCK_SIZE;
    this.redundancy = options?.redundancy ?? DEFAULT_REDUNDANCY;
  }

  getState(): SenderState { return this.state; }
  getSessionId(): number { return this.sessionId; }
  getError(): string { return this.errorMessage; }

  /** Compress data and generate fountain-coded frames. */
  async prepare(): Promise<void> {
    this.state = 'preparing';

    const originalSize = this.rawData.length;
    if (originalSize > 65535) {
      this.state = 'error';
      this.errorMessage = 'File too large (max 64KB)';
      return;
    }

    // Try compression
    let payload: Uint8Array;
    if (isCompressionAvailable()) {
      const compressed = await deflateCompress(this.rawData);
      if (compressed.length < originalSize) {
        payload = compressed;
        this.compressed = true;
      } else {
        payload = this.rawData;
        this.compressed = false;
      }
    } else {
      payload = this.rawData;
      this.compressed = false;
    }

    this.compressedData = payload;
    this.crc32 = computeCrc32(payload);

    // Fountain encode
    this.encodedBlocks = encodeBlocks(payload, this.blockSize, this.redundancy);
    const k = Math.ceil(payload.length / this.blockSize);
    const n = this.encodedBlocks.length;

    // Build SYN frame
    const syn: SynMessage = {
      subtype: TransferSubtype.SYN,
      sessionId: this.sessionId,
      compressed: this.compressed,
      originalSize,
      compressedSize: payload.length,
      blockSize: this.blockSize,
      sourceBlockCount: k,
      totalBlockCount: n,
      crc32: this.crc32,
      fileName: this.fileName,
    };
    this.synFrame = encodeTransferFrame(syn);

    // Build DATA frames
    this.dataFrames = this.encodedBlocks.map(block =>
      encodeTransferFrame({
        subtype: TransferSubtype.DATA,
        sessionId: this.sessionId,
        blockIndex: block.index,
        degree: block.degree,
        sourceIndices: block.sourceIndices,
        payload: block.payload,
      })
    );

    this.state = 'awaiting-syn-ack';
  }

  getSynFrame(): Uint8Array {
    if (!this.synFrame) throw new Error('Not prepared');
    return this.synFrame;
  }

  getDataFrames(): Uint8Array[] {
    return this.dataFrames;
  }

  getTotalFrames(): number {
    return this.dataFrames.length;
  }

  getOriginalSize(): number {
    return this.rawData.length;
  }

  getCompressedSize(): number {
    return this.compressedData?.length ?? this.rawData.length;
  }

  isCompressed(): boolean {
    return this.compressed;
  }

  onSynAck(msg: SynAckMessage): boolean {
    if (msg.sessionId !== this.sessionId) return false;
    this.state = 'sending';
    return true;
  }

  onDone(msg: DoneMessage): boolean {
    if (msg.sessionId !== this.sessionId) return false;
    if (msg.status === DoneStatus.Success) {
      this.state = 'complete';
    } else {
      this.state = 'error';
      this.errorMessage = 'Receiver reported CRC mismatch';
    }
    return true;
  }

  markSending(): void {
    this.state = 'sending';
  }

  markAwaitingDone(): void {
    this.state = 'awaiting-done';
  }

  markError(msg: string): void {
    this.state = 'error';
    this.errorMessage = msg;
  }
}

// --- Receiver Session ---

export class TransferReceiverSession {
  private state: ReceiverState = 'idle';
  private sessionId = 0;
  private fileName = '';
  private originalSize = 0;
  private compressedSize = 0;
  private compressed = false;
  private expectedCrc32 = 0;
  private decoder: FountainDecoder | null = null;
  private receivedData: Uint8Array | null = null;
  private errorMessage = '';

  getState(): ReceiverState { return this.state; }
  getFileName(): string { return this.fileName; }
  getOriginalSize(): number { return this.originalSize; }
  getError(): string { return this.errorMessage; }

  getProgress(): number {
    return this.decoder?.getProgress() ?? 0;
  }

  /** Handle SYN: initialize decoder, return SYN_ACK frame. */
  onSyn(msg: SynMessage): Uint8Array {
    this.sessionId = msg.sessionId;
    this.fileName = msg.fileName;
    this.originalSize = msg.originalSize;
    this.compressedSize = msg.compressedSize;
    this.compressed = msg.compressed;
    this.expectedCrc32 = msg.crc32;

    this.decoder = new FountainDecoder(
      msg.sourceBlockCount,
      msg.blockSize,
      msg.compressedSize,
    );

    this.state = 'receiving';

    return encodeTransferFrame({
      subtype: TransferSubtype.SYN_ACK,
      sessionId: this.sessionId,
    });
  }

  /** Handle DATA: feed block to decoder. Returns true when complete. */
  onData(msg: DataMessage): boolean {
    if (msg.sessionId !== this.sessionId || !this.decoder) return false;
    return this.decoder.addBlock({
      index: msg.blockIndex,
      degree: msg.degree,
      sourceIndices: msg.sourceIndices,
      payload: msg.payload,
    });
  }

  /** Verify CRC and return DONE frame. Call after decoder is complete. */
  async verify(): Promise<Uint8Array> {
    this.state = 'verifying';

    if (!this.decoder || !this.decoder.isComplete()) {
      this.state = 'error';
      this.errorMessage = 'Decoder not complete';
      return encodeTransferFrame({
        subtype: TransferSubtype.DONE,
        sessionId: this.sessionId,
        status: DoneStatus.CrcMismatch,
      });
    }

    const compressedData = this.decoder.getDecoded();
    const crc = computeCrc32(compressedData);

    if (crc !== this.expectedCrc32) {
      this.state = 'error';
      this.errorMessage = 'CRC mismatch';
      return encodeTransferFrame({
        subtype: TransferSubtype.DONE,
        sessionId: this.sessionId,
        status: DoneStatus.CrcMismatch,
      });
    }

    // Decompress if needed
    if (this.compressed) {
      try {
        this.receivedData = await deflateDecompress(compressedData);
      } catch {
        this.state = 'error';
        this.errorMessage = 'Decompression failed';
        return encodeTransferFrame({
          subtype: TransferSubtype.DONE,
          sessionId: this.sessionId,
          status: DoneStatus.CrcMismatch,
        });
      }
    } else {
      this.receivedData = compressedData;
    }

    this.state = 'complete';
    return encodeTransferFrame({
      subtype: TransferSubtype.DONE,
      sessionId: this.sessionId,
      status: DoneStatus.Success,
    });
  }

  /** Get the received file data (only valid when state is 'complete'). */
  getFile(): { data: Uint8Array; name: string } | null {
    if (!this.receivedData) return null;
    return { data: this.receivedData, name: this.fileName };
  }
}
