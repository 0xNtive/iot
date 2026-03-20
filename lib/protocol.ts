import { packBits, unpackBits } from './bitpack.js';
import {
  FrameType,
  ECLevel,
  type QrMessage,
  type ImgMessage,
  type TxtMessage,
  type HelloMessage,
  type SonicMessage,
} from './types.js';
import { FrameError, EncodingError } from './errors.js';
import {
  MAX_PAYLOAD,
  PROTOCOL_VERSION,
  QR_HEADER_SIZE,
  IMG_HEADER_SIZE,
  TXT_HEADER_SIZE,
  QR_VERSIONS,
  MAX_IMG_DIMENSION,
  MAX_TEXT_BYTES,
} from './constants.js';
import { CHUNK_TYPE } from './chunked.js';
import { GAME_FRAME_TYPE } from './game-protocol.js';
import { TRANSFER_FRAME_TYPE } from './transfer-protocol.js';

/**
 * Encode a sonic message into a binary frame
 * @param msg Sonic message to encode
 * @returns Encoded frame as Uint8Array
 * @throws {FrameError} When frame type is unknown
 * @throws {EncodingError} When trying to encode chunked images directly
 */
export function encodeFrame(msg: SonicMessage): Uint8Array {
  switch (msg.type) {
    case FrameType.QR:
      return encodeQrFrame(msg);
    case FrameType.IMG:
      return encodeImgFrame(msg);
    case FrameType.TXT:
      return encodeTxtFrame(msg);
    case FrameType.HELLO:
      return encodeHelloFrame(msg);
    case FrameType.CHUNK:
      throw new EncodingError('Use encodeChunkedImage() for chunked images', 'CHUNK');
    default:
      throw new FrameError(`Unknown frame type: ${msg.type}`);
  }
}

/**
 * Decode a binary frame into a sonic message or frame type indicator
 * @param data Binary frame data
 * @returns Decoded message or string indicating special frame types
 * @throws {FrameError} When frame is too short or frame type is unknown
 */
export function decodeFrame(data: Uint8Array): SonicMessage | 'chunk' | 'game' | 'transfer' {
  if (data.length < 2) {
    throw new FrameError(`Frame too short: expected >= 2 bytes, got ${data.length}`);
  }

  const type = data[0];
  switch (type) {
    case FrameType.QR:
      return decodeQrFrame(data);
    case FrameType.IMG:
      return decodeImgFrame(data);
    case FrameType.TXT:
      return decodeTxtFrame(data);
    case FrameType.HELLO:
      return decodeHelloFrame(data);
    case CHUNK_TYPE:
      return 'chunk';
    case GAME_FRAME_TYPE:
      return 'game';
    case TRANSFER_FRAME_TYPE:
      return 'transfer';
    default:
      throw new FrameError(`Unknown frame type: 0x${type.toString(16)}`);
  }
}

function encodeQrFrame(msg: QrMessage): Uint8Array {
  const versionInfo = QR_VERSIONS[msg.version];
  if (!versionInfo) {
    throw new Error(`Unsupported QR version: ${msg.version}`);
  }

  const packed = packBits(msg.modules);
  const total = QR_HEADER_SIZE + packed.length;
  if (total > MAX_PAYLOAD) {
    throw new Error(`QR frame too large: ${total} > ${MAX_PAYLOAD}`);
  }

  const frame = new Uint8Array(total);
  frame[0] = FrameType.QR;
  frame[1] = ((msg.version & 0x0f) << 4) | ((msg.ecLevel & 0x03) << 2);
  frame[2] = PROTOCOL_VERSION;
  frame.set(packed, QR_HEADER_SIZE);
  return frame;
}

function decodeQrFrame(data: Uint8Array): QrMessage {
  if (data.length < QR_HEADER_SIZE + 1) {
    throw new FrameError(`QR frame too short: expected >= ${QR_HEADER_SIZE + 1} bytes, got ${data.length}`, 'QR');
  }

  const version = (data[1] >> 4) & 0x0f;
  const ecLevel: ECLevel = (data[1] >> 2) & 0x03;
  const versionInfo = QR_VERSIONS[version];
  if (!versionInfo) {
    throw new Error(`Unsupported QR version: ${version}`);
  }

  const packed = data.slice(QR_HEADER_SIZE);
  const totalBits = versionInfo.size * versionInfo.size;
  const modules = unpackBits(packed, totalBits);

  return {
    type: FrameType.QR,
    version,
    ecLevel,
    size: versionInfo.size,
    modules,
  };
}

function encodeImgFrame(msg: ImgMessage): Uint8Array {
  // Input validation hardening
  if (typeof msg.width !== 'number' || !isFinite(msg.width) || msg.width < 1 || msg.width > MAX_IMG_DIMENSION) {
    throw new EncodingError(`Invalid width: ${msg.width} (must be 1-${MAX_IMG_DIMENSION})`, 'IMG');
  }
  if (typeof msg.height !== 'number' || !isFinite(msg.height) || msg.height < 1 || msg.height > MAX_IMG_DIMENSION) {
    throw new EncodingError(`Invalid height: ${msg.height} (must be 1-${MAX_IMG_DIMENSION})`, 'IMG');
  }
  if (!Array.isArray(msg.pixels)) {
    throw new EncodingError('pixels must be an array', 'IMG');
  }
  if (msg.pixels.length !== msg.width * msg.height) {
    throw new EncodingError(`pixels array size mismatch: expected ${msg.width * msg.height}, got ${msg.pixels.length}`, 'IMG');
  }

  const packed = packBits(msg.pixels);
  const total = IMG_HEADER_SIZE + packed.length;
  if (total > MAX_PAYLOAD) {
    throw new Error(`IMG frame too large: ${total} > ${MAX_PAYLOAD}`);
  }

  const frame = new Uint8Array(total);
  frame[0] = FrameType.IMG;
  frame[1] = msg.width;
  frame[2] = msg.height;
  frame[3] = PROTOCOL_VERSION;
  frame.set(packed, IMG_HEADER_SIZE);
  return frame;
}

function decodeImgFrame(data: Uint8Array): ImgMessage {
  if (data.length < IMG_HEADER_SIZE + 1) {
    throw new Error(`IMG frame too short: expected >= ${IMG_HEADER_SIZE + 1} bytes, got ${data.length}`);
  }

  const width = data[1];
  const height = data[2];
  const packed = data.slice(IMG_HEADER_SIZE);
  const totalBits = width * height;
  const pixels = unpackBits(packed, totalBits);

  return {
    type: FrameType.IMG,
    width,
    height,
    pixels,
  };
}

function encodeTxtFrame(msg: TxtMessage): Uint8Array {
  // Input validation hardening
  if (typeof msg.text !== 'string') {
    throw new EncodingError('text must be a string', 'TXT');
  }
  
  const encoded = new TextEncoder().encode(msg.text);
  if (encoded.length > MAX_TEXT_BYTES) {
    throw new EncodingError(`Text too long: ${encoded.length} > ${MAX_TEXT_BYTES} bytes`, 'TXT');
  }

  const total = TXT_HEADER_SIZE + encoded.length;
  const frame = new Uint8Array(total);
  frame[0] = FrameType.TXT;
  frame[1] = PROTOCOL_VERSION;
  frame.set(encoded, TXT_HEADER_SIZE);
  return frame;
}

function decodeTxtFrame(data: Uint8Array): TxtMessage {
  if (data.length < TXT_HEADER_SIZE + 1) {
    throw new Error(`TXT frame too short: expected >= ${TXT_HEADER_SIZE + 1} bytes, got ${data.length}`);
  }

  const textBytes = data.slice(TXT_HEADER_SIZE);
  const text = new TextDecoder().decode(textBytes);

  return {
    type: FrameType.TXT,
    text,
  };
}

function encodeHelloFrame(msg: HelloMessage): Uint8Array {
  // HELLO frame format:
  // Byte 0: Frame type (0x07)
  // Byte 1: Protocol version
  // Byte 2: Number of supported features
  // Bytes 3-N: Feature IDs (1 byte each)
  // Byte N+1: Number of capability strings
  // Bytes N+2-M: Capabilities (length-prefixed strings)

  let totalSize = 4; // Type + version + feature count + capability count
  totalSize += msg.supportedFeatures.length; // Feature IDs

  const capabilityBytes: Uint8Array[] = [];
  for (const cap of msg.capabilities) {
    const encoded = new TextEncoder().encode(cap);
    if (encoded.length > 255) {
      throw new Error(`Capability string too long: ${encoded.length} > 255 bytes`);
    }
    capabilityBytes.push(encoded);
    totalSize += 1 + encoded.length; // Length prefix + string
  }

  if (totalSize > MAX_PAYLOAD) {
    throw new Error(`HELLO frame too large: ${totalSize} > ${MAX_PAYLOAD}`);
  }

  const frame = new Uint8Array(totalSize);
  let offset = 0;

  frame[offset++] = FrameType.HELLO;
  frame[offset++] = msg.protocolVersion;
  frame[offset++] = msg.supportedFeatures.length;

  for (const feature of msg.supportedFeatures) {
    frame[offset++] = feature;
  }

  frame[offset++] = msg.capabilities.length;

  for (let i = 0; i < msg.capabilities.length; i++) {
    const encoded = capabilityBytes[i];
    frame[offset++] = encoded.length;
    frame.set(encoded, offset);
    offset += encoded.length;
  }

  return frame;
}

function decodeHelloFrame(data: Uint8Array): HelloMessage {
  if (data.length < 4) {
    throw new Error(`HELLO frame too short: expected >= 4 bytes, got ${data.length}`);
  }

  let offset = 1; // Skip frame type
  const protocolVersion = data[offset++];
  const featureCount = data[offset++];

  if (data.length < 3 + featureCount + 1) {
    throw new Error(`HELLO frame too short for features: expected >= ${3 + featureCount + 1} bytes, got ${data.length}`);
  }

  const supportedFeatures: number[] = [];
  for (let i = 0; i < featureCount; i++) {
    supportedFeatures.push(data[offset++]);
  }

  const capabilityCount = data[offset++];
  const capabilities: string[] = [];

  for (let i = 0; i < capabilityCount; i++) {
    if (offset >= data.length) {
      throw new Error('HELLO frame too short for capability length');
    }

    const capLength = data[offset++];
    if (offset + capLength > data.length) {
      throw new Error(`HELLO frame too short for capability data: expected ${capLength} bytes`);
    }

    const capBytes = data.slice(offset, offset + capLength);
    capabilities.push(new TextDecoder().decode(capBytes));
    offset += capLength;
  }

  return {
    type: FrameType.HELLO,
    protocolVersion,
    supportedFeatures,
    capabilities,
  };
}
