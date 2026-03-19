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

    if (palette && palette.length > 0) {
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

  /**
   * Preview a palette image directly (no transmission needed).
   */
  showPalettePreview(
    width: number, height: number,
    indices: number[],
    palette: { r: number; g: number; b: number }[],
  ): void {
    this.container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = DISPLAY_PX;
    canvas.height = DISPLAY_PX;
    const ctx = canvas.getContext('2d')!;
    this.renderPalettePixels(ctx, width, height, indices, palette);
    this.container.appendChild(canvas);
    this.info.textContent = `Preview: ${width}x${height} ${palette.length}-color quantized`;
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

    if (msg.palette && msg.palette.length > 0) {
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
    this.renderToCanvas(ctx, width, height, (row, col) => {
      const val = pixels[row * width + col] ?? 0;
      if (val <= 0) return null;
      const maxVal = levels - 1;
      const brightness = maxVal > 0 ? val / maxVal : 1;
      const g = Math.round(0x88 + (0xff - 0x88) * brightness);
      const b = Math.round(0x88 * brightness);
      return { r: 0, g, b };
    });
  }

  private renderPalettePixels(
    ctx: CanvasRenderingContext2D,
    width: number, height: number,
    indices: number[],
    palette: { r: number; g: number; b: number }[],
  ): void {
    this.renderToCanvas(ctx, width, height, (row, col) => {
      const colorIdx = indices[row * width + col] ?? 0;
      return palette[colorIdx] ?? { r: 0, g: 0, b: 0 };
    });
  }

  /**
   * Generic pixel renderer that handles any image size correctly,
   * including images larger than the display canvas.
   */
  private renderToCanvas(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    getColor: (row: number, col: number) => { r: number; g: number; b: number } | null,
  ): void {
    const imgData = ctx.createImageData(DISPLAY_PX, DISPLAY_PX);
    const d = imgData.data;

    // Fill background
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 0x1a; d[i + 1] = 0x1a; d[i + 2] = 0x25; d[i + 3] = 0xff;
    }

    const maxDim = Math.max(width, height);

    if (maxDim <= DISPLAY_PX) {
      // Image fits — scale up with integer-ish cell sizes
      const cellSize = DISPLAY_PX / maxDim;
      const offsetX = (DISPLAY_PX - cellSize * width) / 2;
      const offsetY = (DISPLAY_PX - cellSize * height) / 2;

      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          const color = getColor(row, col);
          if (!color) continue;

          const px0 = Math.floor(offsetX + col * cellSize);
          const py0 = Math.floor(offsetY + row * cellSize);
          const px1 = Math.ceil(offsetX + (col + 1) * cellSize);
          const py1 = Math.ceil(offsetY + (row + 1) * cellSize);

          for (let py = Math.max(0, py0); py < Math.min(py1, DISPLAY_PX); py++) {
            for (let px = Math.max(0, px0); px < Math.min(px1, DISPLAY_PX); px++) {
              const idx = (py * DISPLAY_PX + px) * 4;
              d[idx] = color.r; d[idx + 1] = color.g; d[idx + 2] = color.b; d[idx + 3] = 0xff;
            }
          }
        }
      }
    } else {
      // Image is larger than display — sample/downsample
      const scale = DISPLAY_PX / maxDim;
      const dispW = Math.round(width * scale);
      const dispH = Math.round(height * scale);
      const offsetX = Math.floor((DISPLAY_PX - dispW) / 2);
      const offsetY = Math.floor((DISPLAY_PX - dispH) / 2);

      for (let py = 0; py < dispH; py++) {
        for (let px = 0; px < dispW; px++) {
          const srcRow = Math.floor(py / scale);
          const srcCol = Math.floor(px / scale);
          const color = getColor(
            Math.min(srcRow, height - 1),
            Math.min(srcCol, width - 1),
          );
          if (!color) continue;

          const dx = offsetX + px;
          const dy = offsetY + py;
          if (dx < 0 || dx >= DISPLAY_PX || dy < 0 || dy >= DISPLAY_PX) continue;
          const idx = (dy * DISPLAY_PX + dx) * 4;
          d[idx] = color.r; d[idx + 1] = color.g; d[idx + 2] = color.b; d[idx + 3] = 0xff;
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
