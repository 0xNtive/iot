import { packBits, unpackBits } from './bitpack.js';
import {
  FrameType,
  ECLevel,
  type QrMessage,
  type ImgMessage,
  type TxtMessage,
  type SonicMessage,
} from './types.js';
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

export function encodeFrame(msg: SonicMessage): Uint8Array {
  switch (msg.type) {
    case FrameType.QR:
      return encodeQrFrame(msg);
    case FrameType.IMG:
      return encodeImgFrame(msg);
    case FrameType.TXT:
      return encodeTxtFrame(msg);
    case FrameType.CHUNK:
      throw new Error('Use encodeChunkedImage() for chunked images');
    default:
      throw new Error(`Unknown frame type`);
  }
}

export function decodeFrame(data: Uint8Array): SonicMessage | 'chunk' | 'game' | 'transfer' {
  if (data.length < 2) {
    throw new Error('Frame too short');
  }

  const type = data[0];
  switch (type) {
    case FrameType.QR:
      return decodeQrFrame(data);
    case FrameType.IMG:
      return decodeImgFrame(data);
    case FrameType.TXT:
      return decodeTxtFrame(data);
    case CHUNK_TYPE:
      return 'chunk';
    case GAME_FRAME_TYPE:
      return 'game';
    case TRANSFER_FRAME_TYPE:
      return 'transfer';
    default:
      throw new Error(`Unknown frame type: 0x${type.toString(16)}`);
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
    throw new Error('QR frame too short');
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
  if (msg.width < 1 || msg.width > MAX_IMG_DIMENSION) {
    throw new Error(`Invalid width: ${msg.width}`);
  }
  if (msg.height < 1 || msg.height > MAX_IMG_DIMENSION) {
    throw new Error(`Invalid height: ${msg.height}`);
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
    throw new Error('IMG frame too short');
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
  const encoded = new TextEncoder().encode(msg.text);
  if (encoded.length > MAX_TEXT_BYTES) {
    throw new Error(`Text too long: ${encoded.length} > ${MAX_TEXT_BYTES} bytes`);
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
    throw new Error('TXT frame too short');
  }

  const textBytes = data.slice(TXT_HEADER_SIZE);
  const text = new TextDecoder().decode(textBytes);

  return {
    type: FrameType.TXT,
    text,
  };
}
