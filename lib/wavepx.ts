import { GGWaveTransport } from './transport.js';
import { AudioManager } from './audio.js';
import { encodeFrame, decodeFrame } from './protocol.js';
import { createQrMessage } from './qr.js';
import { encodeChunkedImage, decodeChunkFrame, ChunkAssembler, CHUNK_TYPE } from './chunked.js';
import {
  FrameType,
  SonicState,
  SonicProtocol,
  type SonicMessage,
  type SonicPixelConfig,
  type QrSendOptions,
} from './types.js';
import { SEND_SILENCE_BUFFER_MS, MAX_PAYLOAD, IMG_HEADER_SIZE } from './constants.js';
import { packBits } from './bitpack.js';

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
    this.assembler = new ChunkAssembler((pixels, width, height, progress) => {
      config.onChunkProgress?.(pixels, width, height, progress);
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

          // Check if it's a chunk frame
          if (payload[0] === CHUNK_TYPE) {
            const chunk = decodeChunkFrame(payload);
            const result = this.assembler.addChunk(chunk);
            if (result) {
              this.config.onReceive?.({
                type: FrameType.CHUNK,
                width: result.width,
                height: result.height,
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
    if (wasListening) {
      this.stopListening();
    }

    this.setState(SonicState.Sending);

    try {
      const frame = encodeFrame(msg);
      const samples = this.transport.encode(frame, this.protocol, this.volume);
      await this.audio.play(samples);
      await new Promise((r) => setTimeout(r, SEND_SILENCE_BUFFER_MS));
    } finally {
      this.setState(SonicState.Idle);
      if (wasListening) {
        await this.startListening();
      }
    }
  }

  /**
   * Send a large image as multiple chunks with RLE compression.
   * onProgress callback reports (chunkIndex, totalChunks).
   */
  async sendChunkedImage(
    width: number,
    height: number,
    pixels: boolean[],
    onProgress?: (sent: number, total: number) => void,
  ): Promise<void> {
    // If it fits in a single IMG frame, just send it directly
    const packed = packBits(pixels);
    if (IMG_HEADER_SIZE + packed.length <= MAX_PAYLOAD && width <= 255 && height <= 255) {
      await this.send({ type: FrameType.IMG, width, height, pixels });
      return;
    }

    const chunks = encodeChunkedImage(width, height, pixels);
    const wasListening = this.listening;
    if (wasListening) {
      this.stopListening();
    }

    this.setState(SonicState.Sending);
    this.sendAborted = false;

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (this.sendAborted) break;

        const samples = this.transport.encode(chunks[i], this.protocol, this.volume);
        await this.audio.play(samples);
        onProgress?.(i + 1, chunks.length);
        await new Promise((r) => setTimeout(r, SEND_SILENCE_BUFFER_MS));
      }
    } finally {
      this.sendAborted = false;
      this.setState(SonicState.Idle);
      if (wasListening) {
        await this.startListening();
      }
    }
  }

  /** Abort an in-progress chunked send */
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
    await this.send({
      type: FrameType.TXT,
      text,
    });
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
