import { SonicProtocol } from '../../lib/types.js';

export class Controls {
  private protocolSelect: HTMLSelectElement;
  private volumeSlider: HTMLInputElement;
  private volumeValue: HTMLSpanElement;
  private listenBtn: HTMLButtonElement;
  private sendBtn: HTMLButtonElement;
  private pauseBtn: HTMLButtonElement;
  private stopBtn: HTMLButtonElement;
  private downloadBtn: HTMLButtonElement;

  private onProtocolChange: (protocol: SonicProtocol) => void;
  private onVolumeChange: (volume: number) => void;
  private onListen: () => void;
  private onSend: () => void;
  private onPause: () => void;
  private onStop: () => void;
  private onDownload: () => void;

  private isPaused = false;

  constructor(handlers: {
    onProtocolChange: (protocol: SonicProtocol) => void;
    onVolumeChange: (volume: number) => void;
    onListen: () => void;
    onSend: () => void;
    onPause: () => void;
    onStop: () => void;
    onDownload: () => void;
  }) {
    this.protocolSelect = document.getElementById('protocol-select') as HTMLSelectElement;
    this.volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
    this.volumeValue = document.getElementById('volume-value') as HTMLSpanElement;
    this.listenBtn = document.getElementById('btn-listen') as HTMLButtonElement;
    this.sendBtn = document.getElementById('btn-send') as HTMLButtonElement;
    this.pauseBtn = document.getElementById('btn-pause') as HTMLButtonElement;
    this.stopBtn = document.getElementById('btn-stop') as HTMLButtonElement;
    this.downloadBtn = document.getElementById('btn-download') as HTMLButtonElement;

    this.onProtocolChange = handlers.onProtocolChange;
    this.onVolumeChange = handlers.onVolumeChange;
    this.onListen = handlers.onListen;
    this.onSend = handlers.onSend;
    this.onPause = handlers.onPause;
    this.onStop = handlers.onStop;
    this.onDownload = handlers.onDownload;

    this.protocolSelect.addEventListener('change', () => {
      this.onProtocolChange(parseInt(this.protocolSelect.value) as SonicProtocol);
    });

    this.volumeSlider.addEventListener('input', () => {
      const vol = parseInt(this.volumeSlider.value);
      this.volumeValue.textContent = `${vol}%`;
      this.onVolumeChange(vol);
    });

    this.listenBtn.addEventListener('click', () => this.onListen());
    this.sendBtn.addEventListener('click', () => this.onSend());
    this.pauseBtn.addEventListener('click', () => this.onPause());
    this.stopBtn.addEventListener('click', () => this.onStop());
    this.downloadBtn.addEventListener('click', () => this.onDownload());
  }

  setListening(listening: boolean): void {
    this.listenBtn.textContent = listening ? 'Stop Listening' : 'Start Listening';
    this.listenBtn.classList.toggle('listening', listening);
  }

  setSending(sending: boolean): void {
    this.sendBtn.hidden = sending;
    this.downloadBtn.hidden = sending;
    this.pauseBtn.hidden = !sending;
    this.stopBtn.hidden = !sending;

    if (!sending) {
      this.isPaused = false;
      this.pauseBtn.textContent = 'PAUSE';
      this.pauseBtn.classList.remove('paused');
    }
  }

  setPaused(paused: boolean): void {
    this.isPaused = paused;
    this.pauseBtn.textContent = paused ? 'RESUME' : 'PAUSE';
    this.pauseBtn.classList.toggle('paused', paused);
  }
}
