import { ditherImage, type DitherAlgorithm } from '../../lib/dither.js';

const CANVAS_PX = 320;

export class PixelCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gridSize: number;
  private pixels: number[];  // 0 to maxVal
  private grayLevels: number = 2; // 2=B&W, 4=2bit, 16=4bit
  private colorMode = false;
  private rgbaData: Uint8Array | null = null; // raw RGBA for color quantization
  private rawLuma: Float64Array | null = null; // cached luminance for re-dithering
  private ditherAlgorithm: DitherAlgorithm = 'none';
  private drawing = false;
  private drawValue = 0;

  constructor(canvasId: string, initialSize = 16) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.gridSize = initialSize;
    this.pixels = new Array(initialSize * initialSize).fill(0);

    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this.drawing = false);
    this.canvas.addEventListener('mouseleave', () => this.drawing = false);

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.onMouseDown(e.touches[0]);
    });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.onMouseMove(e.touches[0]);
    });
    this.canvas.addEventListener('touchend', () => this.drawing = false);

    this.render();
  }

  setGridSize(size: number): void {
    this.gridSize = size;
    this.pixels = new Array(size * size).fill(0);
    this.rawLuma = null;
    this.render();
  }

  setGrayLevels(levels: number): void {
    if (this.rawLuma) {
      // Re-dither from cached luminance at new level count
      this.grayLevels = levels;
      this.applyDither();
    } else {
      // Re-quantize existing pixels
      const maxOld = this.grayLevels - 1;
      const maxNew = levels - 1;
      this.pixels = this.pixels.map(v => {
        if (maxOld <= 1) return v > 0 ? maxNew : 0;
        return Math.round((v / maxOld) * maxNew);
      });
      this.grayLevels = levels;
    }
    this.render();
  }

  getGrayLevels(): number {
    return this.grayLevels;
  }

  getBitDepth(): 1 | 2 | 4 {
    if (this.grayLevels <= 2) return 1;
    if (this.grayLevels <= 4) return 2;
    return 4;
  }

  setDitherAlgorithm(alg: DitherAlgorithm): void {
    this.ditherAlgorithm = alg;
    if (this.rawLuma && !this.colorMode) {
      this.applyDither();
      this.render();
    }
  }

  getDitherAlgorithm(): DitherAlgorithm {
    return this.ditherAlgorithm;
  }

  clear(): void {
    this.pixels.fill(0);
    this.rawLuma = null;
    this.render();
  }

  /** Return pixels as boolean array (for B&W mode). */
  getPixelsBW(): boolean[] {
    return this.pixels.map(v => v > 0);
  }

  /** Return pixels as number array (for grayscale). */
  getPixels(): number[] {
    return [...this.pixels];
  }

  getGridSize(): number {
    return this.gridSize;
  }

  setColorMode(enabled: boolean): void {
    this.colorMode = enabled;
    if (!enabled) this.rgbaData = null;
    this.render();
  }

  isColorMode(): boolean {
    return this.colorMode;
  }

  /** Get raw RGBA pixel data for color quantization (only available after loadImage in color mode). */
  getRgbaData(): Uint8Array | null {
    return this.rgbaData;
  }

  async loadImage(file: File): Promise<void> {
    const img = await createImageBitmap(file);
    const size = this.gridSize;

    const off = new OffscreenCanvas(size, size);
    const ctx = off.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    const scale = Math.min(size / img.width, size / img.height);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const x = Math.round((size - w) / 2);
    const y = Math.round((size - h) / 2);
    ctx.drawImage(img, x, y, w, h);

    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    if (this.colorMode) {
      // Store raw RGBA for palette quantization
      this.rgbaData = new Uint8Array(data);
      this.rawLuma = null;
      // Still compute grayscale pixels for preview
      this.pixels = new Array(size * size);
      for (let i = 0; i < size * size; i++) {
        this.pixels[i] = 1; // just mark as "has content"
      }
      this.renderColor();
    } else {
      this.rgbaData = null;
      // Compute and cache luminance for re-dithering
      this.rawLuma = new Float64Array(size * size);
      for (let i = 0; i < size * size; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        this.rawLuma[i] = 255 - luma; // inverted
      }
      this.applyDither();
      this.render();
    }
  }

  private applyDither(): void {
    if (!this.rawLuma) return;
    this.pixels = ditherImage(
      this.rawLuma,
      this.gridSize,
      this.gridSize,
      this.grayLevels,
      this.ditherAlgorithm,
    );
  }

  private getCellFromEvent(e: MouseEvent | Touch): { col: number; row: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = CANVAS_PX / rect.width;
    const scaleY = CANVAS_PX / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const cellSize = CANVAS_PX / this.gridSize;
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);

    if (col < 0 || col >= this.gridSize || row < 0 || row >= this.gridSize) {
      return null;
    }
    return { col, row };
  }

  private onMouseDown(e: MouseEvent | Touch): void {
    this.drawing = true;
    const cell = this.getCellFromEvent(e);
    if (!cell) return;
    const idx = cell.row * this.gridSize + cell.col;
    const maxVal = this.grayLevels - 1;
    // Toggle between 0 and max
    this.drawValue = this.pixels[idx] > 0 ? 0 : maxVal;
    this.pixels[idx] = this.drawValue;
    this.render();
  }

  private onMouseMove(e: MouseEvent | Touch): void {
    if (!this.drawing) return;
    const cell = this.getCellFromEvent(e);
    if (!cell) return;
    const idx = cell.row * this.gridSize + cell.col;
    this.pixels[idx] = this.drawValue;
    this.render();
  }

  private render(): void {
    const cellSize = CANVAS_PX / this.gridSize;
    const maxVal = this.grayLevels - 1;
    this.ctx.fillStyle = '#1a1a25';
    this.ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        const idx = row * this.gridSize + col;
        const val = this.pixels[idx];
        const x = col * cellSize;
        const y = row * cellSize;

        if (val > 0) {
          const brightness = maxVal > 0 ? val / maxVal : 1;
          const g = Math.round(0x88 + (0xff - 0x88) * brightness);
          this.ctx.fillStyle = `rgb(0, ${g}, ${Math.round(0x88 * brightness)})`;
          this.ctx.fillRect(x, y, cellSize, cellSize);
        }

        if (this.gridSize <= 64) {
          this.ctx.strokeStyle = '#222233';
          this.ctx.lineWidth = 0.5;
          this.ctx.strokeRect(x, y, cellSize, cellSize);
        }
      }
    }
  }

  private renderColor(): void {
    if (!this.rgbaData) return;
    const size = this.gridSize;
    const cellSize = CANVAS_PX / size;

    this.ctx.fillStyle = '#1a1a25';
    this.ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const i = row * size + col;
        const r = this.rgbaData[i * 4];
        const g = this.rgbaData[i * 4 + 1];
        const b = this.rgbaData[i * 4 + 2];
        this.ctx.fillStyle = `rgb(${r},${g},${b})`;
        this.ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
    }
  }
}
