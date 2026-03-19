import { SonicPixel } from '../lib/wavepx.js';
import { encodeChunkedImage, encodeChunkedGrayImage } from '../lib/chunked.js';
import { rleEncode, rleEncodeGray } from '../lib/rle.js';
import { packBits, packValues } from '../lib/bitpack.js';
import {
  FrameType,
  SonicState,
  SonicProtocol,
  type SonicMessage,
} from '../lib/types.js';

import { PixelCanvas } from './components/pixel-canvas.js';
import { QrPanel } from './components/qr-panel.js';
import { TextPanel } from './components/text-panel.js';
import { ReceiveDisplay } from './components/receive-display.js';
import { StatusBar } from './components/status-bar.js';
import { Controls } from './components/controls.js';

let sonic: SonicPixel | null = null;
let activeTab = 'draw';
let isListening = false;

let pixelCanvas: PixelCanvas;
let qrPanel: QrPanel;
let textPanel: TextPanel;
let receiveDisplay: ReceiveDisplay;
let statusBar: StatusBar;
let controls: Controls;

function updatePayloadSize(size: number): void {
  statusBar.setPayloadSize(size);
}

function updateChunkInfo(): void {
  const chunkEl = document.getElementById('chunk-count')!;
  const infoEl = document.getElementById('chunk-info')!;

  if (activeTab !== 'draw') {
    chunkEl.textContent = '';
    infoEl.textContent = '';
    return;
  }

  const size = pixelCanvas.getGridSize();
  const pixels = pixelCanvas.getPixels();
  const bitDepth = pixelCanvas.getBitDepth();
  const levels = pixelCanvas.getGrayLevels();

  let rawSize: number;
  let rleSize: number;
  let chunks: Uint8Array[];

  if (bitDepth === 1) {
    const bw = pixels.map(v => v > 0);
    rawSize = packBits(bw).length;
    rleSize = rleEncode(bw).length;
    chunks = encodeChunkedImage(size, size, bw);
  } else {
    rawSize = packValues(pixels, bitDepth).length;
    rleSize = rleEncodeGray(pixels).length;
    chunks = encodeChunkedGrayImage(size, size, pixels, bitDepth);
  }

  const dataSize = Math.min(rawSize, rleSize);
  const useRle = rleSize < rawSize;
  const ratio = rawSize > 0 ? (dataSize / rawSize * 100).toFixed(0) : '100';

  statusBar.setPayloadSize(dataSize);

  const modeLabel = levels > 2 ? `${levels}-gray` : 'B&W';

  if (chunks.length === 1) {
    chunkEl.textContent = '(1 frame)';
    infoEl.textContent = `${modeLabel} ${useRle ? 'RLE' : 'Raw'} ${dataSize}B — ${ratio}% of raw`;
  } else {
    chunkEl.textContent = `(${chunks.length} chunks)`;
    infoEl.textContent = `${modeLabel} ${useRle ? 'RLE' : 'Raw'} ${dataSize}B — ${ratio}% of raw ${rawSize}B`;
  }
}

function initTabs(): void {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = (tab as HTMLElement).dataset.tab!;
      activeTab = target;

      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      contents.forEach((c) => c.classList.remove('active'));
      document.getElementById(`tab-${target}`)!.classList.add('active');

      updateChunkInfo();
    });
  });
}

function initComponents(): void {
  pixelCanvas = new PixelCanvas('pixel-canvas');
  qrPanel = new QrPanel(updatePayloadSize);
  textPanel = new TextPanel(updatePayloadSize);
  receiveDisplay = new ReceiveDisplay();
  statusBar = new StatusBar();

  const gridSelect = document.getElementById('grid-size') as HTMLSelectElement;
  gridSelect.addEventListener('change', () => {
    pixelCanvas.setGridSize(parseInt(gridSelect.value));
    updateChunkInfo();
  });

  const graySelect = document.getElementById('gray-levels') as HTMLSelectElement;
  graySelect.addEventListener('change', () => {
    pixelCanvas.setGrayLevels(parseInt(graySelect.value));
    updateChunkInfo();
  });

  document.getElementById('clear-canvas')!.addEventListener('click', () => {
    pixelCanvas.clear();
    updateChunkInfo();
  });

  const imageUpload = document.getElementById('image-upload') as HTMLInputElement;
  imageUpload.addEventListener('change', async () => {
    const file = imageUpload.files?.[0];
    if (!file) return;
    await pixelCanvas.loadImage(file);
    updateChunkInfo();
    imageUpload.value = '';
  });

  controls = new Controls({
    onProtocolChange: (protocol) => sonic?.setProtocol(protocol),
    onVolumeChange: (volume) => sonic?.setVolume(volume),
    onListen: toggleListening,
    onSend: handleSend,
  });

  updateChunkInfo();
}

async function initSonic(): Promise<void> {
  const sp = new SonicPixel({
    onReceive: (msg: SonicMessage) => {
      receiveDisplay.show(msg);
    },
    onError: (err: Error) => {
      console.error('wavepx error:', err);
      statusBar.setState(SonicState.Error);
    },
    onStateChange: (state: SonicState) => {
      statusBar.setState(state);
      controls.setSending(state === SonicState.Sending);
    },
    onAudioLevel: (level: number) => {
      statusBar.setAudioLevel(level);
    },
    onChunkProgress: (pixels, width, height, bitDepth, progress) => {
      receiveDisplay.showProgress(pixels, width, height, bitDepth, progress);
    },
    protocol: SonicProtocol.AudibleFast,
    volume: 50,
  });

  await sp.init();
  sonic = sp;
}

async function toggleListening(): Promise<void> {
  try {
    if (!sonic) await initSonic();

    if (isListening) {
      sonic!.stopListening();
      isListening = false;
      controls.setListening(false);
    } else {
      await sonic!.startListening();
      isListening = true;
      controls.setListening(true);
    }
  } catch (err) {
    console.error('Listen error:', err);
    alert(`Listening failed: ${err instanceof Error ? err.message : err}`);
  }
}

async function handleSend(): Promise<void> {
  if (!sonic) await initSonic();

  try {
    switch (activeTab) {
      case 'draw': {
        const size = pixelCanvas.getGridSize();
        const bitDepth = pixelCanvas.getBitDepth();
        const pixels = pixelCanvas.getPixels();

        if (bitDepth === 1) {
          await sonic!.sendChunkedImage(
            size, size, pixels.map(v => v > 0),
            (sent, total) => statusBar.setSendProgress(sent, total),
          );
        } else {
          await sonic!.sendGrayImage(
            size, size, pixels, bitDepth,
            (sent, total) => statusBar.setSendProgress(sent, total),
          );
        }
        break;
      }
      case 'qr': {
        const msg = qrPanel.getMessage();
        if (!msg) { alert('Enter text to generate a QR code first'); return; }
        await sonic!.send(msg);
        break;
      }
      case 'text': {
        const text = textPanel.getText();
        if (!text) { alert('Enter text to send'); return; }
        await sonic!.sendText(text);
        break;
      }
    }
  } catch (err) {
    console.error('Send error:', err);
    alert(`Send failed: ${err instanceof Error ? err.message : err}`);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initComponents();
});
