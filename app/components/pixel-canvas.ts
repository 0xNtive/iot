const CANVAS_PX = 320;

export class PixelCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gridSize: number;
  private pixels: boolean[];
  private drawing = false;
  private drawValue = true;

  constructor(canvasId: string, initialSize = 16) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.gridSize = initialSize;
    this.pixels = new Array(initialSize * initialSize).fill(false);

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
    this.pixels = new Array(size * size).fill(false);
    this.render();
  }

  clear(): void {
    this.pixels.fill(false);
    this.render();
  }

  getPixels(): boolean[] {
    return [...this.pixels];
  }

  getGridSize(): number {
    return this.gridSize;
  }

  /**
   * Load an image file, convert to monochrome, fit into current grid size.
   */
  async loadImage(file: File): Promise<void> {
    const img = await createImageBitmap(file);
    const size = this.gridSize;

    // Draw image scaled to grid size on an offscreen canvas
    const off = new OffscreenCanvas(size, size);
    const ctx = off.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    // Fit image maintaining aspect ratio
    const scale = Math.min(size / img.width, size / img.height);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const x = Math.round((size - w) / 2);
    const y = Math.round((size - h) / 2);
    ctx.drawImage(img, x, y, w, h);

    // Convert to monochrome
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    this.pixels = new Array(size * size);
    for (let i = 0; i < size * size; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      this.pixels[i] = luma < 128; // dark = on
    }

    this.render();
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
    this.drawValue = !this.pixels[idx];
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
    this.ctx.fillStyle = '#1a1a25';
    this.ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        const idx = row * this.gridSize + col;
        const x = col * cellSize;
        const y = row * cellSize;

        if (this.pixels[idx]) {
          this.ctx.fillStyle = '#00ff88';
          this.ctx.fillRect(x, y, cellSize, cellSize);
        }

        // Only draw grid lines for sizes <= 64 (too dense otherwise)
        if (this.gridSize <= 64) {
          this.ctx.strokeStyle = '#222233';
          this.ctx.lineWidth = 0.5;
          this.ctx.strokeRect(x, y, cellSize, cellSize);
        }
      }
    }
  }
}
