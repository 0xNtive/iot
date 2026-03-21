import { SonicState } from '../../lib/types.js';
import { Visualizer } from './visualizer.js';

export class StatusBar {
  private stateEl: HTMLElement;
  private payloadEl: HTMLElement;
  private transferBar: HTMLElement;
  private transferFill: HTMLElement;
  private transferText: HTMLElement;
  private visualizer: Visualizer;

  constructor() {
    this.stateEl = document.getElementById('status-state')!;
    this.payloadEl = document.getElementById('payload-size')!;
    this.transferBar = document.getElementById('transfer-bar')!;
    this.transferFill = document.getElementById('transfer-fill')!;
    this.transferText = document.getElementById('transfer-text')!;

    const canvas = document.getElementById('audio-visualizer') as HTMLCanvasElement;
    this.visualizer = new Visualizer(canvas);
  }

  /** Connect the visualizer to a real-time spectrum source. */
  setSpectrumSource(fn: () => Uint8Array | null): void {
    this.visualizer.setSpectrumSource(fn);
  }

  setState(state: SonicState): void {
    const labels: Record<SonicState, string> = {
      [SonicState.Idle]: 'Idle',
      [SonicState.Listening]: 'Listening',
      [SonicState.Sending]: 'Sending',
      [SonicState.Error]: 'Error',
    };
    this.stateEl.textContent = `Status: ${labels[state]}`;
    this.stateEl.style.color = state === SonicState.Error ? '#ff0066' :
      state === SonicState.Sending ? '#ffaa00' :
      state === SonicState.Listening ? '#00ff88' : '';

    this.visualizer.setSending(state === SonicState.Sending);

    if (state !== SonicState.Sending) {
      this.transferBar.hidden = true;
      this.visualizer.setChunkProgress(0);
    }
  }

  setAudioLevel(level: number): void {
    this.visualizer.setAudioLevel(level);
  }

  setPayloadSize(size: number): void {
    this.payloadEl.textContent = String(size);
    this.payloadEl.style.color = size > 140 ? '#ff0066' : '';
  }

  setSendProgress(sent: number, total: number): void {
    this.stateEl.textContent = `Sending ${sent}/${total}`;
    this.stateEl.style.color = '#ffaa00';

    if (total > 1) {
      this.transferBar.hidden = false;
      const pct = (sent / total * 100).toFixed(0);
      this.transferFill.style.width = `${pct}%`;
      this.transferText.textContent = `CHUNK ${sent} OF ${total}`;
      this.visualizer.setChunkProgress(sent / total);
    }
  }
}
