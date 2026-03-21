/**
 * Real-time audio spectrum visualizer using FFT frequency data.
 * Shows actual frequency content as an equalizer, not random bars.
 * Pauses when idle to save CPU.
 */
const NUM_BARS = 16;
const BAR_GAP = 2;
const IDLE_TIMEOUT = 500;
const SMOOTHING = 0.3;

export class Visualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bars: number[] = new Array(NUM_BARS).fill(0);
  private sending = false;
  private chunkProgress = 0;
  private animId = 0;
  private running = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private getSpectrum: (() => Uint8Array | null) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.drawBaseline();
  }

  /** Set the function that provides real-time frequency data. */
  setSpectrumSource(fn: () => Uint8Array | null): void {
    this.getSpectrum = fn;
  }

  /** Called when audio level changes — just ensures the loop is running. */
  setAudioLevel(_level: number): void {
    this.ensureRunning();
  }

  setSending(sending: boolean): void {
    this.sending = sending;
    if (sending) this.ensureRunning();
  }

  setChunkProgress(progress: number): void {
    this.chunkProgress = progress;
  }

  destroy(): void {
    this.stop();
    if (this.idleTimer) clearTimeout(this.idleTimer);
  }

  private ensureRunning(): void {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    if (!this.running) this.start();
  }

  private start(): void {
    this.running = true;
    const animate = () => {
      if (!this.running) return;
      this.draw();
      this.animId = requestAnimationFrame(animate);
    };
    animate();
  }

  private stop(): void {
    this.running = false;
    cancelAnimationFrame(this.animId);
  }

  private scheduleStop(): void {
    if (this.idleTimer) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (!this.sending) {
        const maxBar = Math.max(...this.bars);
        if (maxBar < 0.02) {
          this.stop();
          this.bars.fill(0);
          this.drawBaseline();
        }
      }
    }, IDLE_TIMEOUT);
  }

  private drawBaseline(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.fillStyle = '#2a2a3a';
    this.ctx.fillRect(0, h - 1, w, 1);
  }

  private draw(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const barW = (w - (NUM_BARS - 1) * BAR_GAP) / NUM_BARS;

    this.ctx.clearRect(0, 0, w, h);

    // Get real frequency data if available
    const spectrum = this.getSpectrum?.();
    if (spectrum && spectrum.length > 0) {
      // Map frequency bins to bars (logarithmic-ish grouping for perceptual balance)
      const binCount = spectrum.length; // typically 128
      for (let i = 0; i < NUM_BARS; i++) {
        // Use logarithmic distribution: lower bars = fewer bins, higher bars = more bins
        const startFrac = Math.pow(i / NUM_BARS, 1.5);
        const endFrac = Math.pow((i + 1) / NUM_BARS, 1.5);
        const startBin = Math.floor(startFrac * binCount);
        const endBin = Math.max(startBin + 1, Math.floor(endFrac * binCount));

        let sum = 0;
        for (let b = startBin; b < endBin && b < binCount; b++) {
          sum += spectrum[b];
        }
        const avg = sum / (endBin - startBin) / 255; // normalize to 0-1
        // Smooth transition
        this.bars[i] += (avg - this.bars[i]) * SMOOTHING;
      }
    } else {
      // No spectrum — decay to zero
      for (let i = 0; i < NUM_BARS; i++) {
        this.bars[i] *= 0.85;
      }
    }

    // Check if idle
    const maxBar = Math.max(...this.bars);
    if (!this.sending && maxBar < 0.01) {
      this.scheduleStop();
    }

    // Draw bars
    for (let i = 0; i < NUM_BARS; i++) {
      const barH = Math.max(2, this.bars[i] * h);
      const x = i * (barW + BAR_GAP);
      const y = h - barH;

      if (this.sending) {
        const chunkPos = i / NUM_BARS;
        this.ctx.fillStyle = chunkPos <= this.chunkProgress ? '#00ff88' : '#00aa55';
      } else {
        // Color by intensity
        if (this.bars[i] > 0.7) {
          this.ctx.fillStyle = '#00ff88';
        } else if (this.bars[i] > 0.4) {
          this.ctx.fillStyle = '#00cc66';
        } else if (this.bars[i] > 0.15) {
          this.ctx.fillStyle = '#00aa55';
        } else {
          this.ctx.fillStyle = '#007744';
        }
      }

      const radius = Math.min(barW / 2, 2);
      this.ctx.beginPath();
      this.ctx.moveTo(x, y + barH);
      this.ctx.lineTo(x, y + radius);
      this.ctx.quadraticCurveTo(x, y, x + radius, y);
      this.ctx.lineTo(x + barW - radius, y);
      this.ctx.quadraticCurveTo(x + barW, y, x + barW, y + radius);
      this.ctx.lineTo(x + barW, y + barH);
      this.ctx.fill();
    }

    // Baseline
    this.ctx.fillStyle = '#2a2a3a';
    this.ctx.fillRect(0, h - 1, w, 1);
  }
}
