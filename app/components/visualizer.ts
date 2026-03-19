/**
 * Animated audio visualizer — replaces the text-based meter.
 * Shows bouncing bars that respond to audio level and sending state.
 */
const NUM_BARS = 16;
const BAR_GAP = 2;
const DECAY = 0.85;
const SEND_PULSE_SPEED = 0.15;

export class Visualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bars: number[] = new Array(NUM_BARS).fill(0);
  private targetLevel = 0;
  private sending = false;
  private sendPhase = 0;
  private chunkProgress = 0;
  private animId = 0;
  private active = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.start();
  }

  setAudioLevel(level: number): void {
    this.targetLevel = Math.min(1, level * 40);
  }

  setSending(sending: boolean): void {
    this.sending = sending;
    if (!sending) this.sendPhase = 0;
  }

  setChunkProgress(progress: number): void {
    this.chunkProgress = progress;
  }

  private start(): void {
    this.active = true;
    const animate = () => {
      if (!this.active) return;
      this.draw();
      this.animId = requestAnimationFrame(animate);
    };
    animate();
  }

  destroy(): void {
    this.active = false;
    cancelAnimationFrame(this.animId);
  }

  private draw(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const barW = (w - (NUM_BARS - 1) * BAR_GAP) / NUM_BARS;

    this.ctx.clearRect(0, 0, w, h);

    if (this.sending) {
      this.sendPhase += SEND_PULSE_SPEED;
      // Wave pattern during sending
      for (let i = 0; i < NUM_BARS; i++) {
        const wave = Math.sin(this.sendPhase + i * 0.4) * 0.5 + 0.5;
        const target = wave * 0.6 + 0.2;
        this.bars[i] += (target - this.bars[i]) * 0.3;
      }
    } else {
      // Respond to audio level
      for (let i = 0; i < NUM_BARS; i++) {
        const jitter = Math.random() * this.targetLevel * 0.5;
        const target = this.targetLevel * (0.5 + jitter);
        this.bars[i] = Math.max(this.bars[i] * DECAY, target);
      }
    }

    for (let i = 0; i < NUM_BARS; i++) {
      const barH = Math.max(2, this.bars[i] * h);
      const x = i * (barW + BAR_GAP);
      const y = h - barH;

      if (this.sending) {
        // Progress-based coloring: completed chunks are brighter
        const chunkPos = i / NUM_BARS;
        if (chunkPos <= this.chunkProgress) {
          this.ctx.fillStyle = '#00ff88';
        } else {
          this.ctx.fillStyle = '#00aa55';
        }
      } else if (this.bars[i] > 0.6) {
        this.ctx.fillStyle = '#00ff88';
      } else if (this.bars[i] > 0.3) {
        this.ctx.fillStyle = '#00cc66';
      } else {
        this.ctx.fillStyle = '#00aa55';
      }

      // Rounded bar tops
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
