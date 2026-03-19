import { SonicProtocol } from '../../lib/types.js';

export class Controls {
  private protocolSelect: HTMLSelectElement;
  private volumeSlider: HTMLInputElement;
  private volumeValue: HTMLSpanElement;
  private listenBtn: HTMLButtonElement;
  private sendBtn: HTMLButtonElement;

  private onProtocolChange: (protocol: SonicProtocol) => void;
  private onVolumeChange: (volume: number) => void;
  private onListen: () => void;
  private onSend: () => void;

  private isListening = false;

  constructor(handlers: {
    onProtocolChange: (protocol: SonicProtocol) => void;
    onVolumeChange: (volume: number) => void;
    onListen: () => void;
    onSend: () => void;
  }) {
    this.protocolSelect = document.getElementById('protocol-select') as HTMLSelectElement;
    this.volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
    this.volumeValue = document.getElementById('volume-value') as HTMLSpanElement;
    this.listenBtn = document.getElementById('btn-listen') as HTMLButtonElement;
    this.sendBtn = document.getElementById('btn-send') as HTMLButtonElement;

    this.onProtocolChange = handlers.onProtocolChange;
    this.onVolumeChange = handlers.onVolumeChange;
    this.onListen = handlers.onListen;
    this.onSend = handlers.onSend;

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
  }

  setListening(listening: boolean): void {
    this.isListening = listening;
    this.listenBtn.textContent = listening ? 'Stop Listening' : 'Start Listening';
    this.listenBtn.classList.toggle('listening', listening);
  }

  setSending(sending: boolean): void {
    this.sendBtn.disabled = sending;
    this.sendBtn.textContent = sending ? 'SENDING...' : 'SEND';
  }
}
