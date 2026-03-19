import QRCode from 'qrcode';
import { FrameType, ECLevel, type QrMessage, type QrSendOptions } from './types.js';
import { QR_VERSIONS, QR_HEADER_SIZE, MAX_PAYLOAD } from './constants.js';

const EC_MAP: Record<ECLevel, string> = {
  [ECLevel.L]: 'L',
  [ECLevel.M]: 'M',
  [ECLevel.Q]: 'Q',
  [ECLevel.H]: 'H',
};

/**
 * Create a QrMessage from text input.
 * Automatically selects the smallest QR version that fits within MAX_PAYLOAD.
 */
export function createQrMessage(text: string, opts?: QrSendOptions): QrMessage {
  const ecLevel = opts?.ecLevel ?? ECLevel.L;

  // If version specified, use it; otherwise auto-select
  if (opts?.version) {
    return generateQr(text, opts.version, ecLevel);
  }

  // Try versions 1-4 in order, pick smallest that works
  const versions = Object.keys(QR_VERSIONS).map(Number).sort((a, b) => a - b);
  for (const version of versions) {
    try {
      return generateQr(text, version, ecLevel);
    } catch {
      continue;
    }
  }

  throw new Error('Text too long to fit in any supported QR version within payload limit');
}

function generateQr(text: string, version: number, ecLevel: ECLevel): QrMessage {
  const versionInfo = QR_VERSIONS[version];
  if (!versionInfo) {
    throw new Error(`Unsupported QR version: ${version}`);
  }

  const qr = QRCode.create(text, {
    version,
    errorCorrectionLevel: EC_MAP[ecLevel],
  });

  const size = qr.modules.size;
  const data = qr.modules.data;
  const modules: boolean[] = new Array(size * size);

  for (let i = 0; i < size * size; i++) {
    modules[i] = data[i] === 1;
  }

  const packedSize = Math.ceil(modules.length / 8);
  const total = QR_HEADER_SIZE + packedSize;
  if (total > MAX_PAYLOAD) {
    throw new Error(`QR frame would be ${total} bytes, exceeding ${MAX_PAYLOAD}`);
  }

  return {
    type: FrameType.QR,
    version,
    ecLevel,
    size,
    modules,
    text,
  };
}
