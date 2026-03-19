import { FrameType, type SonicMessage, type QrMessage, type ImgMessage, type TxtMessage } from '../../lib/types.js';

const DISPLAY_PX = 300;

export class ReceiveDisplay {
  private container: HTMLElement;
  private info: HTMLElement;

  constructor() {
    this.container = document.getElementById('receive-display')!;
    this.info = document.getElementById('receive-info')!;
  }

  show(msg: SonicMessage): void {
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
    }
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

    const cellSize = Math.floor(DISPLAY_PX / Math.max(msg.width, msg.height));
    const offsetX = Math.floor((DISPLAY_PX - cellSize * msg.width) / 2);
    const offsetY = Math.floor((DISPLAY_PX - cellSize * msg.height) / 2);

    ctx.fillStyle = '#1a1a25';
    ctx.fillRect(0, 0, DISPLAY_PX, DISPLAY_PX);

    for (let row = 0; row < msg.height; row++) {
      for (let col = 0; col < msg.width; col++) {
        const idx = row * msg.width + col;
        if (msg.pixels[idx]) {
          ctx.fillStyle = '#00ff88';
          ctx.fillRect(offsetX + col * cellSize, offsetY + row * cellSize, cellSize, cellSize);
        }
      }
    }

    this.container.appendChild(canvas);
    this.info.textContent = `Image ${msg.width}x${msg.height} (${msg.pixels.filter(Boolean).length} px on)`;
  }

  private renderTxt(msg: TxtMessage): void {
    const div = document.createElement('div');
    div.className = 'receive-text';
    div.textContent = msg.text;
    this.container.appendChild(div);
    this.info.textContent = `Text: ${new TextEncoder().encode(msg.text).length} bytes`;
  }
}
