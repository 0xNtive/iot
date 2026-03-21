/**
 * Animated audio visualizer — shows bouncing bars for audio level and sending state.
 * Pauses animation when idle to save CPU/battery.
 */
const NUM_BARS = 16;
const BAR_GAP = 2;
const DECAY = 0.85;
const SEND_PULSE_SPEED = 0.15;
const IDLE_TIMEOUT = 500;

export class Visualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bars: number[] = new Array(NUM_BARS).fill(0);
  private targetLevel = 0;
  private sending = false;
  private sendPhase = 0;
  private chunkProgress = 0;
  private animId = 0;
  private running = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.drawBaseline();
  }

  setAudioLevel(level: number): void {
    this.targetLevel = Math.min(1, level * 40);
    if (this.targetLevel > 0.01) this.ensureRunning();
  }

  setSending(sending: boolean): void {
    this.sending = sending;
    if (!sending) this.sendPhase = 0;
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

      // Check if idle: not sending and all bars near zero
      if (!this.sending && this.targetLevel < 0.01) {
        const maxBar = Math.max(...this.bars);
        if (maxBar < 0.02) {
          this.scheduleStop();
        }
      }

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
      if (!this.sending && this.targetLevel < 0.01) {
        this.stop();
        this.bars.fill(0);
        this.drawBaseline();
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

    if (this.sending) {
      this.sendPhase += SEND_PULSE_SPEED;
      for (let i = 0; i < NUM_BARS; i++) {
        const wave = Math.sin(this.sendPhase + i * 0.4) * 0.5 + 0.5;
        const target = wave * 0.6 + 0.2;
        this.bars[i] += (target - this.bars[i]) * 0.3;
      }
    } else {
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
        const chunkPos = i / NUM_BARS;
        this.ctx.fillStyle = chunkPos <= this.chunkProgress ? '#00ff88' : '#00aa55';
      } else if (this.bars[i] > 0.6) {
        this.ctx.fillStyle = '#00ff88';
      } else if (this.bars[i] > 0.3) {
        this.ctx.fillStyle = '#00cc66';
      } else {
        this.ctx.fillStyle = '#00aa55';
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

    this.ctx.fillStyle = '#2a2a3a';
    this.ctx.fillRect(0, h - 1, w, 1);
  }
}
