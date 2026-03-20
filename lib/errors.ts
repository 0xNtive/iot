/**
 * Error hierarchy for consistent error handling across the library
 */

/**
 * Base error class for all wavepx errors
 */
export class WavepxError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'WavepxError';
  }
}

/**
 * Frame encoding/decoding related errors
 */
export class FrameError extends WavepxError {
  constructor(message: string, public readonly frameType?: string) {
    super(message, 'FRAME_ERROR');
    this.name = 'FrameError';
  }
}

/**
 * Data encoding/compression related errors
 */
export class EncodingError extends WavepxError {
  constructor(message: string, public readonly encodingType?: string) {
    super(message, 'ENCODING_ERROR');
    this.name = 'EncodingError';
  }
}

/**
 * Transport/transmission related errors
 */
export class TransportError extends WavepxError {
  constructor(message: string, public readonly transportType?: string) {
    super(message, 'TRANSPORT_ERROR');
    this.name = 'TransportError';
  }
}