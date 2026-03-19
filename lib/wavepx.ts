import { GGWaveTransport } from './transport.js';
import { AudioManager } from './audio.js';
import { encodeFrame, decodeFrame } from './protocol.js';
import { createQrMessage } from './qr.js';
import {
  encodeChunkedImage, encodeChunkedGrayImage,
  decodeChunkFrame, ChunkAssembler, CHUNK_TYPE, BitDepth,
} from './chunked.js';
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

// Map protocol families to their "fastest" variant
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

  constructor(config: SonicPixelConfig = {}) {
    this.config = config;
    this.protocol = config.protocol ?? SonicProtocol.AudibleFast;
    this.volume = config.volume ?? 50;
    this.assembler = new ChunkAssembler((pixels, width, height, bitDepth, progress) => {
      const bd = bitDepth === BitDepth.Gray4 ? 2 : bitDepth === BitDepth.Gray16 ? 4 : 1;
      config.onChunkProgress?.(pixels, width, height, bd, progress);
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
              });
            }
          } else {
            const msg = decodeFrame(payload);
            if (msg !== 'chunk') {
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

  /**
   * Send a B&W image as chunks.
   */
  async sendChunkedImage(
    width: number,
    height: number,
    pixels: boolean[],
    onProgress?: (sent: number, total: number) => void,
  ): Promise<void> {
    // Single-frame shortcut
    const packed = packBits(pixels);
    if (IMG_HEADER_SIZE + packed.length <= MAX_PAYLOAD && width <= 255 && height <= 255) {
      await this.send({ type: FrameType.IMG, width, height, pixels });
      return;
    }

    const chunks = encodeChunkedImage(width, height, pixels);
    await this.sendChunks(chunks, onProgress);
  }

  /**
   * Send a grayscale image as chunks.
   * pixels: quantized values (0 to levels-1).
   * bitDepth: 1, 2, or 4.
   */
  async sendGrayImage(
    width: number,
    height: number,
    pixels: number[],
    bitDepth: 1 | 2 | 4,
    onProgress?: (sent: number, total: number) => void,
  ): Promise<void> {
    const chunks = encodeChunkedGrayImage(width, height, pixels, bitDepth);
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

    // Use fastest variant of current protocol family for multi-chunk transfers
    const turboProto = FASTEST_VARIANT[this.protocol] ?? this.protocol;

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (this.sendAborted) break;

        const samples = this.transport.encode(chunks[i], turboProto, this.volume);
        await this.audio.play(samples);
        onProgress?.(i + 1, chunks.length);

        // Shorter gap between chunks — we're not listening during send
        if (i < chunks.length - 1) {
          await new Promise((r) => setTimeout(r, CHUNK_SILENCE_BUFFER_MS));
        }
      }
    } finally {
      this.sendAborted = false;
      this.setState(SonicState.Idle);
      if (wasListening) await this.startListening();
    }
  }

  abortSend(): void {
    this.sendAborted = true;
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
