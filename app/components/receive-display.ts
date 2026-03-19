import { FrameType, type SonicMessage, type QrMessage, type ImgMessage, type TxtMessage, type ChunkedImgMessage } from '../../lib/types.js';

const DISPLAY_PX = 300;

export class ReceiveDisplay {
  private container: HTMLElement;
  private info: HTMLElement;
  private progressCanvas: HTMLCanvasElement | null = null;
  private progressCtx: CanvasRenderingContext2D | null = null;

  constructor() {
    this.container = document.getElementById('receive-display')!;
    this.info = document.getElementById('receive-info')!;
  }

  show(msg: SonicMessage): void {
    this.progressCanvas = null;
    this.progressCtx = null;
    this.container.innerHTML = '';
    this.info.textContent = '';

    switch (msg.type) {
      case FrameType.QR:
        this.renderQr(msg);
        break;
      case FrameType.IMG:
        this.renderImg(msg);
        break;
      case FrameType.TXT:
        this.renderTxt(msg);
        break;
      case FrameType.CHUNK:
        this.renderChunkedImg(msg);
        break;
    }
  }

  /**
   * Progressive render for chunked image — called on each chunk arrival.
   */
  showProgress(pixels: boolean[], width: number, height: number, progress: number): void {
    if (!this.progressCanvas) {
      this.container.innerHTML = '';
      this.progressCanvas = document.createElement('canvas');
      this.progressCanvas.width = DISPLAY_PX;
      this.progressCanvas.height = DISPLAY_PX;
      this.progressCtx = this.progressCanvas.getContext('2d')!;
      this.container.appendChild(this.progressCanvas);
    }

    this.renderPixels(this.progressCtx!, width, height, pixels);

    const pct = Math.round(progress * 100);
    const onCount = pixels.filter(Boolean).length;
    this.info.textContent = `Receiving ${width}x${height} — ${pct}% (${onCount} px)`;
  }

  private renderQr(msg: QrMessage): void {
    const canvas = document.createElement('canvas');
    canvas.width = DISPLAY_PX;
    canvas.height = DISPLAY_PX;
    const ctx = canvas.getContext('2d')!;

    const cellSize = Math.floor(DISPLAY_PX / msg.size);
    const offset = Math.floor((DISPLAY_PX - cellSize * msg.size) / 2);

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, DISPLAY_PX, DISPLAY_PX);

    for (let row = 0; row < msg.size; row++) {
      for (let col = 0; col < msg.size; col++) {
        const idx = row * msg.size + col;
        ctx.fillStyle = msg.modules[idx] ? '#00ff88' : '#0a0a0f';
        ctx.fillRect(offset + col * cellSize, offset + row * cellSize, cellSize, cellSize);
      }
    }

    this.container.appendChild(canvas);
    this.info.textContent = `QR v${msg.version} (${msg.size}x${msg.size}) EC=${['L','M','Q','H'][msg.ecLevel]}`;
  }

  private renderImg(msg: ImgMessage): void {
    const canvas = document.createElement('canvas');
    canvas.width = DISPLAY_PX;
    canvas.height = DISPLAY_PX;
    const ctx = canvas.getContext('2d')!;
    this.renderPixels(ctx, msg.width, msg.height, msg.pixels);
    this.container.appendChild(canvas);
    this.info.textContent = `Image ${msg.width}x${msg.height} (${msg.pixels.filter(Boolean).length} px on)`;
  }

  private renderChunkedImg(msg: ChunkedImgMessage): void {
    const canvas = document.createElement('canvas');
    canvas.width = DISPLAY_PX;
    canvas.height = DISPLAY_PX;
    const ctx = canvas.getContext('2d')!;
    this.renderPixels(ctx, msg.width, msg.height, msg.pixels);
    this.container.appendChild(canvas);
    this.info.textContent = `Image ${msg.width}x${msg.height} (${msg.pixels.filter(Boolean).length} px on) — complete`;
  }

  private renderPixels(ctx: CanvasRenderingContext2D, width: number, height: number, pixels: boolean[]): void {
    const maxDim = Math.max(width, height);
    const cellSize = DISPLAY_PX / maxDim;
    const offsetX = (DISPLAY_PX - cellSize * width) / 2;
    const offsetY = (DISPLAY_PX - cellSize * height) / 2;

    ctx.fillStyle = '#1a1a25';
    ctx.fillRect(0, 0, DISPLAY_PX, DISPLAY_PX);

    // For large images, use ImageData for performance
    if (maxDim > 64) {
      const imgData = ctx.createImageData(DISPLAY_PX, DISPLAY_PX);
      const d = imgData.data;
      // Fill background
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 0x1a; d[i+1] = 0x1a; d[i+2] = 0x25; d[i+3] = 0xff;
      }
      // Draw pixels
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          if (pixels[row * width + col]) {
            const px0 = Math.floor(offsetX + col * cellSize);
            const py0 = Math.floor(offsetY + row * cellSize);
            const px1 = Math.floor(offsetX + (col + 1) * cellSize);
            const py1 = Math.floor(offsetY + (row + 1) * cellSize);
            for (let py = py0; py < py1 && py < DISPLAY_PX; py++) {
              for (let px = px0; px < px1 && px < DISPLAY_PX; px++) {
                const idx = (py * DISPLAY_PX + px) * 4;
                d[idx] = 0x00; d[idx+1] = 0xff; d[idx+2] = 0x88; d[idx+3] = 0xff;
              }
            }
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    } else {
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          if (pixels[row * width + col]) {
            ctx.fillStyle = '#00ff88';
            ctx.fillRect(offsetX + col * cellSize, offsetY + row * cellSize, cellSize, cellSize);
          }
        }
      }
    }
  }

  private renderTxt(msg: TxtMessage): void {
    const div = document.createElement('div');
    div.className = 'receive-text';
    div.textContent = msg.text;
    this.container.appendChild(div);
    this.info.textContent = `Text: ${new TextEncoder().encode(msg.text).length} bytes`;
  }
}
