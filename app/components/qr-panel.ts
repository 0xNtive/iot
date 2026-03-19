import { createQrMessage } from '../../lib/qr.js';
import { encodeFrame } from '../../lib/protocol.js';
import { ECLevel, type QrMessage } from '../../lib/types.js';

const PREVIEW_PX = 320;

export class QrPanel {
  private input: HTMLTextAreaElement;
  private ecSelect: HTMLSelectElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentMessage: QrMessage | null = null;
  private onPayloadSize: (size: number) => void;

  constructor(onPayloadSize: (size: number) => void) {
    this.input = document.getElementById('qr-input') as HTMLTextAreaElement;
    this.ecSelect = document.getElementById('qr-ec') as HTMLSelectElement;
    this.canvas = document.getElementById('qr-preview') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.onPayloadSize = onPayloadSize;

    this.input.addEventListener('input', () => this.update());
    this.ecSelect.addEventListener('change', () => this.update());

    this.renderEmpty();
  }

  getMessage(): QrMessage | null {
    return this.currentMessage;
  }

  private update(): void {
    const text = this.input.value.trim();
    if (!text) {
      this.currentMessage = null;
      this.renderEmpty();
      this.onPayloadSize(0);
      return;
    }

    try {
      const ecLevel = parseInt(this.ecSelect.value) as ECLevel;
      this.currentMessage = createQrMessage(text, { ecLevel });
      this.renderQr(this.currentMessage);
      const frame = encodeFrame(this.currentMessage);
      this.onPayloadSize(frame.length);
    } catch (err) {
      this.currentMessage = null;
      this.renderError(err instanceof Error ? err.message : 'Error');
      this.onPayloadSize(0);
    }
  }

  private renderQr(msg: QrMessage): void {
    const cellSize = Math.floor(PREVIEW_PX / msg.size);
    const offset = Math.floor((PREVIEW_PX - cellSize * msg.size) / 2);

    this.ctx.fillStyle = '#1a1a25';
    this.ctx.fillRect(0, 0, PREVIEW_PX, PREVIEW_PX);

    for (let row = 0; row < msg.size; row++) {
      for (let col = 0; col < msg.size; col++) {
        const idx = row * msg.size + col;
        this.ctx.fillStyle = msg.modules[idx] ? '#00ff88' : '#0a0a0f';
        this.ctx.fillRect(offset + col * cellSize, offset + row * cellSize, cellSize, cellSize);
      }
    }
  }

  private renderEmpty(): void {
    this.ctx.fillStyle = '#1a1a25';
    this.ctx.fillRect(0, 0, PREVIEW_PX, PREVIEW_PX);
    this.ctx.fillStyle = '#6a6a7a';
    this.ctx.font = '12px "JetBrains Mono"';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Enter text to preview QR', PREVIEW_PX / 2, PREVIEW_PX / 2);
  }

  private renderError(message: string): void {
    this.ctx.fillStyle = '#1a1a25';
    this.ctx.fillRect(0, 0, PREVIEW_PX, PREVIEW_PX);
    this.ctx.fillStyle = '#ff0066';
    this.ctx.font = '11px "JetBrains Mono"';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(message, PREVIEW_PX / 2, PREVIEW_PX / 2);
  }
}
