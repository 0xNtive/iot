/**
 * Transfer panel — drag-drop file transfer with fountain codes.
 *
 * Handles both sending (drop a file, initiate transfer) and
 * receiving (auto-detects incoming SYN, shows progress, offers download).
 */

import { TransferReceiverSession } from '../../lib/transfer-session.js';
import {
  TransferSubtype,
  type TransferMessage,
  type SynMessage,
  type DataMessage,
} from '../../lib/transfer-protocol.js';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export class TransferPanel {
  private dropZone: HTMLElement;
  private fileInput: HTMLInputElement;
  private fileInfo: HTMLElement;
  private fileNameEl: HTMLElement;
  private fileSizeEl: HTMLElement;
  private sendBtn: HTMLButtonElement;
  private progressSection: HTMLElement;
  private sendFill: HTMLElement;
  private sendText: HTMLElement;
  private statusEl: HTMLElement;
  private recvSection: HTMLElement;
  private recvFill: HTMLElement;
  private recvText: HTMLElement;
  private downloadLink: HTMLAnchorElement;

  private selectedFile: File | null = null;
  private receiverSession: TransferReceiverSession | null = null;
  private onSendFile: ((data: ArrayBuffer, name: string) => Promise<void>) | null = null;
  private onSendRaw: ((frame: Uint8Array) => void) | null = null;

  constructor() {
    this.dropZone = document.getElementById('transfer-drop-zone')!;
    this.fileInput = document.getElementById('transfer-file-input') as HTMLInputElement;
    this.fileInfo = document.getElementById('transfer-file-info')!;
    this.fileNameEl = document.getElementById('transfer-file-name')!;
    this.fileSizeEl = document.getElementById('transfer-file-size')!;
    this.sendBtn = document.getElementById('transfer-send-btn') as HTMLButtonElement;
    this.progressSection = document.getElementById('transfer-progress-section')!;
    this.sendFill = document.getElementById('transfer-send-fill')!;
    this.sendText = document.getElementById('transfer-send-text')!;
    this.statusEl = document.getElementById('transfer-status')!;
    this.recvSection = document.getElementById('transfer-receive-section')!;
    this.recvFill = document.getElementById('transfer-recv-fill')!;
    this.recvText = document.getElementById('transfer-recv-text')!;
    this.downloadLink = document.getElementById('transfer-download-link') as HTMLAnchorElement;

    // Drag & drop
    this.dropZone.addEventListener('click', () => this.fileInput.click());
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('drag-over');
    });
    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('drag-over');
    });
    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('drag-over');
      const file = (e as DragEvent).dataTransfer?.files[0];
      if (file) this.selectFile(file);
    });
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      if (file) this.selectFile(file);
      this.fileInput.value = '';
    });

    // Send button
    this.sendBtn.addEventListener('click', () => this.handleSend());
  }

  setSendCallback(cb: (data: ArrayBuffer, name: string) => Promise<void>): void {
    this.onSendFile = cb;
  }

  setSendRawCallback(cb: (frame: Uint8Array) => void): void {
    this.onSendRaw = cb;
  }

  /** Handle incoming transfer protocol messages (called from main). */
  async handleTransferMessage(msg: TransferMessage): Promise<void> {
    switch (msg.subtype) {
      case TransferSubtype.SYN:
        await this.handleSyn(msg as SynMessage);
        break;
      case TransferSubtype.DATA:
        this.handleData(msg as DataMessage);
        break;
    }
  }

  /** Update send progress (called from SonicPixel progress callback). */
  setSendProgress(sent: number, total: number, state: string): void {
    this.progressSection.hidden = false;
    const pct = total > 0 ? (sent / total * 100).toFixed(0) : '0';
    this.sendFill.style.width = `${pct}%`;
    this.sendText.textContent = `${sent}/${total} blocks`;
    this.statusEl.textContent = state;
  }

  private selectFile(file: File): void {
    if (file.size > 65535) {
      this.statusEl.textContent = `File too large: ${formatBytes(file.size)} (max 64KB)`;
      return;
    }
    this.selectedFile = file;
    this.fileInfo.hidden = false;
    this.fileNameEl.textContent = file.name;
    this.fileSizeEl.textContent = formatBytes(file.size);
    this.sendBtn.hidden = false;
    this.statusEl.textContent = '';
    this.progressSection.hidden = true;
  }

  private async handleSend(): Promise<void> {
    if (!this.selectedFile || !this.onSendFile) return;

    this.sendBtn.hidden = true;
    this.progressSection.hidden = false;
    this.sendFill.style.width = '0%';
    this.sendText.textContent = 'Preparing...';
    this.statusEl.textContent = 'Compressing & encoding...';

    try {
      const data = await this.selectedFile.arrayBuffer();
      await this.onSendFile(data, this.selectedFile.name);
    } catch (err) {
      this.statusEl.textContent = `Error: ${err instanceof Error ? err.message : err}`;
    } finally {
      this.sendBtn.hidden = false;
    }
  }

  private async handleSyn(msg: SynMessage): Promise<void> {
    this.receiverSession = new TransferReceiverSession();
    const synAckFrame = this.receiverSession.onSyn(msg);

    this.recvSection.hidden = false;
    this.recvFill.style.width = '0%';
    this.recvText.textContent = `Receiving ${msg.fileName}...`;
    this.downloadLink.hidden = true;

    // Send SYN_ACK
    this.onSendRaw?.(synAckFrame);
  }

  private async handleData(msg: DataMessage): Promise<void> {
    if (!this.receiverSession) return;

    const complete = this.receiverSession.onData(msg);
    const pct = (this.receiverSession.getProgress() * 100).toFixed(0);
    this.recvFill.style.width = `${pct}%`;
    this.recvText.textContent = `Receiving... ${pct}%`;

    if (complete) {
      const doneFrame = await this.receiverSession.verify();

      // Send DONE
      this.onSendRaw?.(doneFrame);

      if (this.receiverSession.getState() === 'complete') {
        const file = this.receiverSession.getFile();
        if (file) {
          this.recvText.textContent = `Received ${file.name} (${formatBytes(file.data.length)})`;
          const blob = new Blob([file.data as BlobPart]);
          const url = URL.createObjectURL(blob);
          this.downloadLink.href = url;
          this.downloadLink.download = file.name;
          this.downloadLink.textContent = `Download ${file.name}`;
          this.downloadLink.hidden = false;
        }
      } else {
        this.recvText.textContent = `Error: ${this.receiverSession.getError()}`;
      }
    }
  }
}
