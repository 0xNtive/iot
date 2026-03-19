export enum FrameType {
  QR = 0x01,
  IMG = 0x02,
  TXT = 0x03,
  CHUNK = 0x04,
}

export enum ECLevel {
  L = 0,
  M = 1,
  Q = 2,
  H = 3,
}

export enum SonicProtocol {
  AudibleNormal = 0,
  AudibleFast = 1,
  AudibleFastest = 2,
  UltrasoundNormal = 3,
  UltrasoundFast = 4,
  UltrasoundFastest = 5,
  DT800Normal = 6,
  DT800Fast = 7,
  DT800Fastest = 8,
}

export enum SonicState {
  Idle = 'idle',
  Listening = 'listening',
  Sending = 'sending',
  Error = 'error',
}

export interface QrMessage {
  type: FrameType.QR;
  version: number;
  ecLevel: ECLevel;
  size: number;
  modules: boolean[];
  text?: string;
}

export interface ImgMessage {
  type: FrameType.IMG;
  width: number;
  height: number;
  pixels: boolean[];
}

export interface TxtMessage {
  type: FrameType.TXT;
  text: string;
}

export interface ChunkedImgMessage {
  type: FrameType.CHUNK;
  width: number;
  height: number;
  bitDepth: number;
  pixels: number[];
  palette?: { r: number; g: number; b: number }[];
}

export type SonicMessage = QrMessage | ImgMessage | TxtMessage | ChunkedImgMessage;

export interface SonicPixelConfig {
  onReceive?: (msg: SonicMessage) => void;
  onError?: (err: Error) => void;
  onStateChange?: (state: SonicState) => void;
  onAudioLevel?: (level: number) => void;
  onChunkProgress?: (pixels: number[], width: number, height: number, bitDepth: number, progress: number, palette?: { r: number; g: number; b: number }[]) => void;
  protocol?: SonicProtocol;
  volume?: number;
}

export interface QrSendOptions {
  ecLevel?: ECLevel;
  version?: number;
}
