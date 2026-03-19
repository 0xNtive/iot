import { SonicPixel } from '../lib/wavepx.js';
import { encodeFrame } from '../lib/protocol.js';
import { createQrMessage } from '../lib/qr.js';
import { packBits } from '../lib/bitpack.js';
import {
  FrameType,
  ECLevel,
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
import { IMG_HEADER_SIZE } from '../lib/constants.js';

let sonic: SonicPixel | null = null;
let activeTab = 'draw';
let isListening = false;

// Components
let pixelCanvas: PixelCanvas;
let qrPanel: QrPanel;
let textPanel: TextPanel;
let receiveDisplay: ReceiveDisplay;
let statusBar: StatusBar;
let controls: Controls;

function updatePayloadSize(size: number): void {
  statusBar.setPayloadSize(size);
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

      // Update payload size for current tab
      updatePayloadForTab();
    });
  });
}

function updatePayloadForTab(): void {
  if (activeTab === 'draw') {
    const size = pixelCanvas.getGridSize();
    const totalPixels = size * size;
    const packedBytes = Math.ceil(totalPixels / 8);
    updatePayloadSize(IMG_HEADER_SIZE + packedBytes);
  }
  // QR and text panels update themselves
}

function initComponents(): void {
  pixelCanvas = new PixelCanvas('pixel-canvas');
  qrPanel = new QrPanel(updatePayloadSize);
  textPanel = new TextPanel(updatePayloadSize);
  receiveDisplay = new ReceiveDisplay();
  statusBar = new StatusBar();

  // Grid size selector
  const gridSelect = document.getElementById('grid-size') as HTMLSelectElement;
  gridSelect.addEventListener('change', () => {
    const size = parseInt(gridSelect.value);
    pixelCanvas.setGridSize(size);
    updatePayloadForTab();
  });

  // Clear button
  document.getElementById('clear-canvas')!.addEventListener('click', () => {
    pixelCanvas.clear();
  });

  controls = new Controls({
    onProtocolChange: (protocol) => sonic?.setProtocol(protocol),
    onVolumeChange: (volume) => sonic?.setVolume(volume),
    onListen: toggleListening,
    onSend: handleSend,
  });

  updatePayloadForTab();
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
    protocol: SonicProtocol.AudibleFast,
    volume: 50,
  });

  await sp.init();
  // Only assign after successful init
  sonic = sp;
}

async function toggleListening(): Promise<void> {
  try {
    if (!sonic) {
      await initSonic();
    }

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
  if (!sonic) {
    await initSonic();
  }

  try {
    switch (activeTab) {
      case 'draw': {
        const size = pixelCanvas.getGridSize();
        await sonic!.sendImage(size, size, pixelCanvas.getPixels());
        break;
      }
      case 'qr': {
        const msg = qrPanel.getMessage();
        if (!msg) {
          alert('Enter text to generate a QR code first');
          return;
        }
        await sonic!.send(msg);
        break;
      }
      case 'text': {
        const text = textPanel.getText();
        if (!text) {
          alert('Enter text to send');
          return;
        }
        await sonic!.sendText(text);
        break;
      }
    }
  } catch (err) {
    console.error('Send error:', err);
    alert(`Send failed: ${err instanceof Error ? err.message : err}`);
  }
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initComponents();
});
