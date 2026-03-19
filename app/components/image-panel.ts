/**
 * Image panel — read-only pixel canvas with dithering/mode controls.
 *
 * Owns its own PixelCanvas (non-interactive) and independent controls
 * for grid size, color mode, dither algorithm, and image loading.
 */

import { PixelCanvas } from './pixel-canvas.js';
import type { DitherAlgorithm } from '../../lib/dither.js';
import { packBits, packValues } from '../../lib/bitpack.js';
import { rleEncode, rleEncodeGray } from '../../lib/rle.js';
import {
  encodeChunkedImage,
  encodeChunkedGrayImage,
  encodeChunkedPaletteImage,
} from '../../lib/chunked.js';
import { quantizeColors, encodePaletteImage } from '../../lib/palette.js';

export class ImagePanel {
  private pixelCanvas: PixelCanvas;
  private colorMode: 'bw' | 'gray4' | 'gray16' | 'color16' = 'bw';
  private chunkInfoEl: HTMLElement;
  private onUpdatePayload: ((size: number) => void) | null = null;

  constructor(onUpdatePayload?: (size: number) => void) {
    this.pixelCanvas = new PixelCanvas('image-canvas', 16, false);
    this.chunkInfoEl = document.getElementById('image-chunk-info')!;
    this.onUpdatePayload = onUpdatePayload ?? null;

    const gridSelect = document.getElementById('image-grid-size') as HTMLSelectElement;
    gridSelect.addEventListener('change', () => {
      this.pixelCanvas.setGridSize(parseInt(gridSelect.value));
      this.updateChunkInfo();
    });

    const modeSelect = document.getElementById('image-color-mode') as HTMLSelectElement;
    modeSelect.addEventListener('change', () => {
      this.colorMode = modeSelect.value as typeof this.colorMode;
      switch (this.colorMode) {
        case 'bw':
          this.pixelCanvas.setColorMode(false);
          this.pixelCanvas.setGrayLevels(2);
          break;
        case 'gray4':
          this.pixelCanvas.setColorMode(false);
          this.pixelCanvas.setGrayLevels(4);
          break;
        case 'gray16':
          this.pixelCanvas.setColorMode(false);
          this.pixelCanvas.setGrayLevels(16);
          break;
        case 'color16':
          this.pixelCanvas.setColorMode(true);
          break;
      }
      this.updateChunkInfo();
    });

    const ditherSelect = document.getElementById('image-dither-mode') as HTMLSelectElement;
    ditherSelect.addEventListener('change', () => {
      this.pixelCanvas.setDitherAlgorithm(ditherSelect.value as DitherAlgorithm);
      this.updateChunkInfo();
    });

    const imageUpload = document.getElementById('image-upload') as HTMLInputElement;
    imageUpload.addEventListener('change', async () => {
      const file = imageUpload.files?.[0];
      if (!file) return;
      await this.pixelCanvas.loadImage(file);
      this.updateChunkInfo();
      imageUpload.value = '';
    });
  }

  getPixelCanvas(): PixelCanvas {
    return this.pixelCanvas;
  }

  getColorMode(): 'bw' | 'gray4' | 'gray16' | 'color16' {
    return this.colorMode;
  }

  updateChunkInfo(): void {
    const size = this.pixelCanvas.getGridSize();

    if (this.colorMode === 'color16') {
      const rgba = this.pixelCanvas.getRgbaData();
      if (!rgba) {
        this.chunkInfoEl.textContent = 'Load an image to use color mode';
        this.onUpdatePayload?.(0);
        return;
      }
      const palImg = quantizeColors(rgba, size, size, 16);
      const data = encodePaletteImage(palImg);
      const chunks = encodeChunkedPaletteImage(palImg);
      this.onUpdatePayload?.(data.length);
      this.chunkInfoEl.textContent = `Palette ${palImg.palette.length}-color ${data.length}B — ${chunks.length} chunk${chunks.length !== 1 ? 's' : ''}`;
      return;
    }

    const pixels = this.pixelCanvas.getPixels();
    const bitDepth = this.pixelCanvas.getBitDepth();
    const levels = this.pixelCanvas.getGrayLevels();

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
    this.onUpdatePayload?.(dataSize);

    const modeLabel = levels > 2 ? `${levels}-gray` : 'B&W';
    this.chunkInfoEl.textContent = `${modeLabel} ${useRle ? 'RLE' : 'Raw'} ${dataSize}B — ${ratio}% of raw — ${chunks.length} chunk${chunks.length !== 1 ? 's' : ''}`;
  }
}
