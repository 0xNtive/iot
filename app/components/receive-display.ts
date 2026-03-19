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

  showProgress(
    pixels: number[], width: number, height: number, bitDepth: number, progress: number,
    palette?: { r: number; g: number; b: number }[],
  ): void {
    if (!this.progressCanvas) {
      this.container.innerHTML = '';
      this.progressCanvas = document.createElement('canvas');
      this.progressCanvas.width = DISPLAY_PX;
      this.progressCanvas.height = DISPLAY_PX;
      this.progressCtx = this.progressCanvas.getContext('2d')!;
      this.container.appendChild(this.progressCanvas);
    }

    if (palette) {
      this.renderPalettePixels(this.progressCtx!, width, height, pixels, palette);
      const pct = Math.round(progress * 100);
      this.info.textContent = `Receiving ${width}x${height} ${palette.length}-color — ${pct}%`;
    } else {
      const levels = 1 << bitDepth;
      this.renderGrayPixels(this.progressCtx!, width, height, pixels, levels);
      const pct = Math.round(progress * 100);
      this.info.textContent = `Receiving ${width}x${height} ${levels > 2 ? levels + '-gray' : 'B&W'} — ${pct}%`;
    }
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
    this.renderGrayPixels(ctx, msg.width, msg.height, msg.pixels.map(b => b ? 1 : 0), 2);
    this.container.appendChild(canvas);
    this.info.textContent = `Image ${msg.width}x${msg.height}`;
  }

  private renderChunkedImg(msg: ChunkedImgMessage): void {
    const canvas = document.createElement('canvas');
    canvas.width = DISPLAY_PX;
    canvas.height = DISPLAY_PX;
    const ctx = canvas.getContext('2d')!;

    if (msg.palette) {
      this.renderPalettePixels(ctx, msg.width, msg.height, msg.pixels, msg.palette);
      this.container.appendChild(canvas);
      this.info.textContent = `Image ${msg.width}x${msg.height} ${msg.palette.length}-color — complete`;
    } else {
      const levels = 1 << msg.bitDepth;
      this.renderGrayPixels(ctx, msg.width, msg.height, msg.pixels, levels);
      this.container.appendChild(canvas);
      this.info.textContent = `Image ${msg.width}x${msg.height} ${levels > 2 ? levels + '-gray' : 'B&W'} — complete`;
    }
  }

  private renderGrayPixels(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    pixels: number[],
    levels: number,
  ): void {
    const maxDim = Math.max(width, height);
    const cellSize = DISPLAY_PX / maxDim;
    const offsetX = (DISPLAY_PX - cellSize * width) / 2;
    const offsetY = (DISPLAY_PX - cellSize * height) / 2;
    const maxVal = levels - 1;

    // Use ImageData for performance on larger images
    const imgData = ctx.createImageData(DISPLAY_PX, DISPLAY_PX);
    const d = imgData.data;
    // Fill background
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 0x1a; d[i+1] = 0x1a; d[i+2] = 0x25; d[i+3] = 0xff;
    }

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const val = pixels[row * width + col];
        if (val <= 0) continue;

        const brightness = maxVal > 0 ? val / maxVal : 1;
        const r = 0;
        const g = Math.round(0x88 + (0xff - 0x88) * brightness);
        const b = Math.round(0x88 * brightness);

        const px0 = Math.floor(offsetX + col * cellSize);
        const py0 = Math.floor(offsetY + row * cellSize);
        const px1 = Math.floor(offsetX + (col + 1) * cellSize);
        const py1 = Math.floor(offsetY + (row + 1) * cellSize);

        for (let py = py0; py < py1 && py < DISPLAY_PX; py++) {
          for (let px = px0; px < px1 && px < DISPLAY_PX; px++) {
            if (px < 0 || py < 0) continue;
            const idx = (py * DISPLAY_PX + px) * 4;
            d[idx] = r; d[idx+1] = g; d[idx+2] = b; d[idx+3] = 0xff;
          }
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  private renderPalettePixels(
    ctx: CanvasRenderingContext2D,
    width: number, height: number,
    indices: number[],
    palette: { r: number; g: number; b: number }[],
  ): void {
    const maxDim = Math.max(width, height);
    const cellSize = DISPLAY_PX / maxDim;
    const offsetX = (DISPLAY_PX - cellSize * width) / 2;
    const offsetY = (DISPLAY_PX - cellSize * height) / 2;

    const imgData = ctx.createImageData(DISPLAY_PX, DISPLAY_PX);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 0x1a; d[i+1] = 0x1a; d[i+2] = 0x25; d[i+3] = 0xff;
    }

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const colorIdx = indices[row * width + col];
        const color = palette[colorIdx] ?? { r: 0, g: 0, b: 0 };

        const px0 = Math.floor(offsetX + col * cellSize);
        const py0 = Math.floor(offsetY + row * cellSize);
        const px1 = Math.floor(offsetX + (col + 1) * cellSize);
        const py1 = Math.floor(offsetY + (row + 1) * cellSize);

        for (let py = py0; py < py1 && py < DISPLAY_PX; py++) {
          for (let px = px0; px < px1 && px < DISPLAY_PX; px++) {
            if (px < 0 || py < 0) continue;
            const idx = (py * DISPLAY_PX + px) * 4;
            d[idx] = color.r; d[idx+1] = color.g; d[idx+2] = color.b; d[idx+3] = 0xff;
          }
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  private renderTxt(msg: TxtMessage): void {
    const div = document.createElement('div');
    div.className = 'receive-text';
    div.textContent = msg.text;
    this.container.appendChild(div);
    this.info.textContent = `Text: ${new TextEncoder().encode(msg.text).length} bytes`;
  }
}
