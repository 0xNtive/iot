export class TextPanel {
  private input: HTMLTextAreaElement;
  private byteCount: HTMLSpanElement;
  private onPayloadSize: (size: number) => void;

  constructor(onPayloadSize: (size: number) => void) {
    this.input = document.getElementById('text-input') as HTMLTextAreaElement;
    this.byteCount = document.getElementById('byte-count') as HTMLSpanElement;
    this.onPayloadSize = onPayloadSize;

    this.input.addEventListener('input', () => this.update());
  }

  getText(): string {
    return this.input.value;
  }

  private update(): void {
    const encoded = new TextEncoder().encode(this.input.value);
    const bytes = encoded.length;
    this.byteCount.textContent = String(bytes);

    if (bytes > 138) {
      this.byteCount.style.color = '#ff0066';
    } else {
      this.byteCount.style.color = '';
    }

    // +2 for TXT header
    this.onPayloadSize(bytes > 0 ? bytes + 2 : 0);
  }
}
