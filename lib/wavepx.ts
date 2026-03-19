import { GGWaveTransport } from './transport.js';
import { AudioManager, waveformsToWav } from './audio.js';
import { encodeFrame, decodeFrame } from './protocol.js';
import { createQrMessage } from './qr.js';
import {
  encodeChunkedImage, encodeChunkedGrayImage, encodeChunkedPaletteImage,
  decodeChunkFrame, ChunkAssembler, CHUNK_TYPE, BitDepth,
} from './chunked.js';
import { type PaletteImage } from './palette.js';
import { GAME_FRAME_TYPE, decodeGameFrame } from './game-protocol.js';
import {
  FrameType,
  SonicState,
  SonicProtocol,
  type SonicMessage,
  type SonicPixelConfig,
  type QrSendOptions,
} from './types.js';
import { SEND_SILENCE_BUFFER_MS, CHUNK_SILENCE_BUFFER_MS, MAX_PAYLOAD, IMG_HEADER_SIZE } from './constants.js';
import { packBits } from './bitpack.js';

const FASTEST_VARIANT: Record<number, SonicProtocol> = {
  0: SonicProtocol.AudibleFastest,
  1: SonicProtocol.AudibleFastest,
  2: SonicProtocol.AudibleFastest,
  3: SonicProtocol.UltrasoundFastest,
  4: SonicProtocol.UltrasoundFastest,
  5: SonicProtocol.UltrasoundFastest,
  6: SonicProtocol.DT800Fastest,
  7: SonicProtocol.DT800Fastest,
  8: SonicProtocol.DT800Fastest,
};

export class SonicPixel {
  private transport = new GGWaveTransport();
  private audio = new AudioManager();
  private config: SonicPixelConfig;
  private state: SonicState = SonicState.Idle;
  private listening = false;
  private protocol: SonicProtocol;
  private volume: number;
  private assembler: ChunkAssembler;
  private sendAborted = false;
  private sendPaused = false;
  private pauseResolve: (() => void) | null = null;

  constructor(config: SonicPixelConfig = {}) {
    this.config = config;
    this.protocol = config.protocol ?? SonicProtocol.AudibleFast;
    this.volume = config.volume ?? 50;
    this.assembler = new ChunkAssembler((pixels, width, height, bitDepth, progress, palette) => {
      const bd = bitDepth === BitDepth.Gray4 ? 2 : bitDepth === BitDepth.Gray16 ? 4 : 1;
      config.onChunkProgress?.(pixels, width, height, bd, progress, palette);
    });
  }

  async init(): Promise<void> {
    await this.transport.init();
    await this.audio.init();
    this.setState(SonicState.Idle);
  }

  async startListening(): Promise<void> {
    if (this.listening) return;
    this.listening = true;
    this.setState(SonicState.Listening);

    await this.audio.startCapture(
      (samples) => {
        if (!this.listening) return;
        try {
          const payload = this.transport.decode(samples);
          if (!payload) return;

          if (payload[0] === CHUNK_TYPE) {
            const chunk = decodeChunkFrame(payload);
            const result = this.assembler.addChunk(chunk);
            if (result) {
              const bd = result.bitDepth === BitDepth.Gray4 ? 2 : result.bitDepth === BitDepth.Gray16 ? 4 : 1;
              this.config.onReceive?.({
                type: FrameType.CHUNK,
                width: result.width,
                height: result.height,
                bitDepth: bd,
                pixels: result.pixels,
                palette: result.palette,
              });
            }
          } else if (payload[0] === GAME_FRAME_TYPE) {
            const gameMsg = decodeGameFrame(payload);
            this.config.onGameMessage?.(gameMsg);
          } else {
            const msg = decodeFrame(payload);
            if (msg !== 'chunk' && msg !== 'game') {
              this.config.onReceive?.(msg);
            }
          }
        } catch (err) {
          this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      },
      this.config.onAudioLevel,
    );
  }

  stopListening(): void {
    this.listening = false;
    this.audio.stopCapture();
    this.setState(SonicState.Idle);
  }

  async send(msg: SonicMessage): Promise<void> {
    const wasListening = this.listening;
    if (wasListening) this.stopListening();

    this.setState(SonicState.Sending);
    try {
      const frame = encodeFrame(msg);
      const samples = this.transport.encode(frame, this.protocol, this.volume);
      await this.audio.play(samples);
      await new Promise((r) => setTimeout(r, SEND_SILENCE_BUFFER_MS));
    } finally {
      this.setState(SonicState.Idle);
      if (wasListening) await this.startListening();
    }
  }

  async sendChunkedImage(
    width: number, height: number, pixels: boolean[],
    onProgress?: (sent: number, total: number) => void,
  ): Promise<void> {
    const packed = packBits(pixels);
    if (IMG_HEADER_SIZE + packed.length <= MAX_PAYLOAD && width <= 255 && height <= 255) {
      await this.send({ type: FrameType.IMG, width, height, pixels });
      return;
    }
    const chunks = encodeChunkedImage(width, height, pixels);
    await this.sendChunks(chunks, onProgress);
  }

  async sendGrayImage(
    width: number, height: number, pixels: number[], bitDepth: 1 | 2 | 4,
    onProgress?: (sent: number, total: number) => void,
  ): Promise<void> {
    const chunks = encodeChunkedGrayImage(width, height, pixels, bitDepth);
    await this.sendChunks(chunks, onProgress);
  }

  async sendPaletteImage(
    img: PaletteImage,
    onProgress?: (sent: number, total: number) => void,
  ): Promise<void> {
    const chunks = encodeChunkedPaletteImage(img);
    await this.sendChunks(chunks, onProgress);
  }

  private async sendChunks(
    chunks: Uint8Array[],
    onProgress?: (sent: number, total: number) => void,
  ): Promise<void> {
    const wasListening = this.listening;
    if (wasListening) this.stopListening();

    this.setState(SonicState.Sending);
    this.sendAborted = false;
    this.sendPaused = false;

    const turboProto = FASTEST_VARIANT[this.protocol] ?? this.protocol;

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (this.sendAborted) break;

        // Wait if paused
        while (this.sendPaused && !this.sendAborted) {
          await new Promise<void>((resolve) => {
            this.pauseResolve = resolve;
          });
        }
        if (this.sendAborted) break;

        const samples = this.transport.encode(chunks[i], turboProto, this.volume);
        await this.audio.play(samples);
        onProgress?.(i + 1, chunks.length);

        if (i < chunks.length - 1) {
          await new Promise((r) => setTimeout(r, CHUNK_SILENCE_BUFFER_MS));
        }
      }
    } finally {
      this.sendAborted = false;
      this.sendPaused = false;
      this.pauseResolve = null;
      this.setState(SonicState.Idle);
      if (wasListening) await this.startListening();
    }
  }

  abortSend(): void {
    this.sendAborted = true;
    // Also unpause if paused, so the loop exits
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
  }

  pauseSend(): void {
    this.sendPaused = true;
  }

  resumeSend(): void {
    this.sendPaused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
  }

  isPaused(): boolean {
    return this.sendPaused;
  }

  /**
   * Generate WAV file for the given frames without playing them.
   * Used for download functionality.
   */
  generateWav(frames: Uint8Array[]): Blob {
    const turboProto = FASTEST_VARIANT[this.protocol] ?? this.protocol;
    const waveforms = frames.map(f => this.transport.encode(f, turboProto, this.volume));
    return waveformsToWav(waveforms, CHUNK_SILENCE_BUFFER_MS);
  }

  /** Send a raw pre-encoded frame (used by game protocol). */
  async sendRaw(frame: Uint8Array): Promise<void> {
    const wasListening = this.listening;
    if (wasListening) this.stopListening();

    this.setState(SonicState.Sending);
    try {
      const samples = this.transport.encode(frame, this.protocol, this.volume);
      await this.audio.play(samples);
      await new Promise((r) => setTimeout(r, SEND_SILENCE_BUFFER_MS));
    } finally {
      this.setState(SonicState.Idle);
      if (wasListening) await this.startListening();
    }
  }

  async sendQr(text: string, opts?: QrSendOptions): Promise<void> {
    const msg = createQrMessage(text, opts);
    await this.send(msg);
  }

  async sendImage(width: number, height: number, pixels: boolean[]): Promise<void> {
    await this.sendChunkedImage(width, height, pixels);
  }

  async sendText(text: string): Promise<void> {
    await this.send({ type: FrameType.TXT, text });
  }

  setProtocol(protocol: SonicProtocol): void {
    this.protocol = protocol;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(100, volume));
  }

  getState(): SonicState {
    return this.state;
  }

  destroy(): void {
    this.stopListening();
    this.transport.destroy();
    this.audio.destroy();
    this.setState(SonicState.Idle);
  }

  private setState(state: SonicState): void {
    this.state = state;
    this.config.onStateChange?.(state);
  }
}
