export const MAX_PAYLOAD = 140;
export const PROTOCOL_VERSION = 0x01;

export const QR_HEADER_SIZE = 3;
export const IMG_HEADER_SIZE = 4;
export const TXT_HEADER_SIZE = 2;

export const QR_VERSIONS: Record<number, { size: number; packedBytes: number }> = {
  1: { size: 21, packedBytes: 56 },
  2: { size: 25, packedBytes: 79 },
  3: { size: 29, packedBytes: 106 },
  4: { size: 33, packedBytes: 137 },
};

export const MAX_IMG_DIMENSION = 32;
export const MAX_TEXT_BYTES = MAX_PAYLOAD - 2; // 138 bytes for TXT

export const SEND_SILENCE_BUFFER_MS = 200;
export const CHUNK_SILENCE_BUFFER_MS = 50; // shorter gap between chunks (not listening during send)

// Transfer protocol constants
export const TRANSFER_BLOCK_SIZE = 130;
export const TRANSFER_REDUNDANCY = 0.5;
export const TRANSFER_SYN_TIMEOUT_MS = 5000;
export const TRANSFER_SYN_RETRIES = 3;
export const TRANSFER_DONE_TIMEOUT_MS = 10000;
