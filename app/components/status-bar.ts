import { SonicState } from '../../lib/types.js';

export class StatusBar {
  private stateEl: HTMLElement;
  private meterEl: HTMLElement;
  private payloadEl: HTMLElement;

  constructor() {
    this.stateEl = document.getElementById('status-state')!;
    this.meterEl = document.getElementById('audio-meter')!;
    this.payloadEl = document.getElementById('payload-size')!;
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
  }

  setAudioLevel(level: number): void {
    const bars = Math.min(8, Math.floor(level * 80));
    this.meterEl.textContent = '|'.repeat(bars) + '-'.repeat(8 - bars);
  }

  setPayloadSize(size: number): void {
    this.payloadEl.textContent = String(size);
    this.payloadEl.style.color = size > 140 ? '#ff0066' : '';
  }
}
