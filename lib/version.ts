/**
 * Package metadata and version information
 */

export const VERSION = '0.1.0';

export interface LibraryInfo {
  /** Library version */
  version: string;
  /** Library name */
  name: string;
  /** Build timestamp */
  buildTime: string;
  /** Supported frame types */
  supportedFrameTypes: string[];
  /** Available features */
  features: string[];
}

/**
 * Get comprehensive library information
 * @returns Library metadata and capabilities
 */
export function getLibraryInfo(): LibraryInfo {
  return {
    version: VERSION,
    name: 'wavepx',
    buildTime: new Date().toISOString(),
    supportedFrameTypes: [
      'QR',
      'IMG', 
      'TXT',
      'CHUNK',
      'GAME',
      'TRANSFER',
      'HELLO'
    ],
    features: [
      'QR code transmission',
      'Image transmission (monochrome/grayscale)',
      'Text transmission',
      'Chunked image support',
      'RLE compression',
      'Palette compression',
      'Game protocol (battleship)',
      'File transfer protocol',
      'Protocol version negotiation',
      'CRC-8 frame validation',
      'XOR encryption',
      'Signal quality estimation',
      'Transmission statistics',
      'Image diff encoding',
      'Configurable sample rate',
      'Retry mechanism',
      'History logging'
    ],
  };
}