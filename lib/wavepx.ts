import { GGWaveTransport } from './transport.js';
import { AudioManager } from './audio.js';
import { encodeFrame, decodeFrame } from './protocol.js';
import { createQrMessage } from './qr.js';
import {
  FrameType,
  SonicState,
  SonicProtocol,
  type SonicMessage,
  type SonicPixelConfig,
  type QrSendOptions,
} from './types.js';
import { SEND_SILENCE_BUFFER_MS } from './constants.js';

export class SonicPixel {
  private transport = new GGWaveTransport();
  private audio = new AudioManager();
  private config: SonicPixelConfig;
  private state: SonicState = SonicState.Idle;
  private listening = false;
  private protocol: SonicProtocol;
  private volume: number;

  constructor(config: SonicPixelConfig = {}) {
    this.config = config;
    this.protocol = config.protocol ?? SonicProtocol.AudibleFast;
    this.volume = config.volume ?? 50;
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
          if (payload) {
            const msg = decodeFrame(payload);
            this.config.onReceive?.(msg);
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

      // Silence buffer to avoid picking up our own transmission
      await new Promise((r) => setTimeout(r, SEND_SILENCE_BUFFER_MS));
    } finally {
      this.setState(SonicState.Idle);
      if (wasListening) {
        await this.startListening();
      }
    }
  }

  async sendQr(text: string, opts?: QrSendOptions): Promise<void> {
    const msg = createQrMessage(text, opts);
    await this.send(msg);
  }

  async sendImage(width: number, height: number, pixels: boolean[]): Promise<void> {
    await this.send({
      type: FrameType.IMG,
      width,
      height,
      pixels,
    });
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
