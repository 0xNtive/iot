/**
 * Compression Arena panel — compares all encoding strategies side-by-side.
 *
 * Shows cards for each strategy with encoded size, compression ratio,
 * chunk count, and a mini preview. Winner highlighted with green glow.
 */

import { PixelCanvas } from './pixel-canvas.js';
import { packBits, packValues } from '../../lib/bitpack.js';
import { rleEncode, rleEncodeGray } from '../../lib/rle.js';
import {
  encodeChunkedImage,
  encodeChunkedGrayImage,
  encodeChunkedPaletteImage,
} from '../../lib/chunked.js';
import { quantizeColors } from '../../lib/palette.js';
import { ditherImage, type DitherAlgorithm } from '../../lib/dither.js';

interface ArenaEntry {
  name: string;
  rawBytes: number;
  encodedBytes: number;
  chunks: number;
  pixels: number[];   // quantized pixel values for preview
  maxVal: number;      // max pixel value for rendering
  palette?: { r: number; g: number; b: number }[];
}

const PREVIEW_SIZE = 80;

export class ArenaPanel {
  private container: HTMLElement;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
  }

  update(pixelCanvas: PixelCanvas, ditherAlg?: DitherAlgorithm): void {
    const size = pixelCanvas.getGridSize();
    const pixels = pixelCanvas.getPixels();
    const rgba = pixelCanvas.getRgbaData();
    const rawLuma = pixelCanvas.getRawLuma();
    const alg = ditherAlg ?? pixelCanvas.getDitherAlgorithm();
    const totalPixels = size * size;

    const entries: ArenaEntry[] = [];

    // --- B&W strategies ---
    let bwPixels: number[];
    if (rawLuma) {
      bwPixels = ditherImage(rawLuma, size, size, 2, alg);
    } else {
      bwPixels = pixels.map(v => v > 0 ? 1 : 0);
    }
    const bw = bwPixels.map(v => v > 0);
    const rawBW = packBits(bw);
    const rleBW = rleEncode(bw);

    entries.push({
      name: 'Raw B&W',
      rawBytes: rawBW.length,
      encodedBytes: rawBW.length,
      chunks: encodeChunkedImage(size, size, bw).length,
      pixels: bwPixels,
      maxVal: 1,
    });

    entries.push({
      name: 'RLE B&W',
      rawBytes: rawBW.length,
      encodedBytes: rleBW.length,
      chunks: encodeChunkedImage(size, size, bw).length,
      pixels: bwPixels,
      maxVal: 1,
    });

    // --- 4-gray strategies ---
    let gray4: number[];
    if (rawLuma) {
      gray4 = ditherImage(rawLuma, size, size, 4, alg);
    } else {
      gray4 = requantize(pixels, pixelCanvas.getGrayLevels(), 4);
    }
    const rawGray4 = packValues(gray4, 2);
    const rleGray4 = rleEncodeGray(gray4);

    entries.push({
      name: 'Raw 4-gray',
      rawBytes: rawGray4.length,
      encodedBytes: rawGray4.length,
      chunks: encodeChunkedGrayImage(size, size, gray4, 2).length,
      pixels: gray4,
      maxVal: 3,
    });

    entries.push({
      name: 'RLE 4-gray',
      rawBytes: rawGray4.length,
      encodedBytes: rleGray4.length,
      chunks: encodeChunkedGrayImage(size, size, gray4, 2).length,
      pixels: gray4,
      maxVal: 3,
    });

    // --- 16-gray strategies ---
    let gray16: number[];
    if (rawLuma) {
      gray16 = ditherImage(rawLuma, size, size, 16, alg);
    } else {
      gray16 = requantize(pixels, pixelCanvas.getGrayLevels(), 16);
    }
    const rawGray16 = packValues(gray16, 4);
    const rleGray16 = rleEncodeGray(gray16);

    entries.push({
      name: 'Raw 16-gray',
      rawBytes: rawGray16.length,
      encodedBytes: rawGray16.length,
      chunks: encodeChunkedGrayImage(size, size, gray16, 4).length,
      pixels: gray16,
      maxVal: 15,
    });

    entries.push({
      name: 'RLE 16-gray',
      rawBytes: rawGray16.length,
      encodedBytes: rleGray16.length,
      chunks: encodeChunkedGrayImage(size, size, gray16, 4).length,
      pixels: gray16,
      maxVal: 15,
    });

    // --- Palette 16-color ---
    if (rgba) {
      const palImg = quantizeColors(rgba, size, size, 16);
      const palChunks = encodeChunkedPaletteImage(palImg);
      const palBytes = palChunks.reduce((s, c) => s + c.length, 0);

      entries.push({
        name: 'Palette 16-color',
        rawBytes: totalPixels,
        encodedBytes: palBytes,
        chunks: palChunks.length,
        pixels: Array.from(palImg.indices),
        maxVal: palImg.palette.length - 1,
        palette: palImg.palette,
      });
    }

    this.render(entries, size);
  }

  private render(entries: ArenaEntry[], gridSize: number): void {
    if (entries.length === 0) {
      this.container.innerHTML = '<div class="arena-empty">Load an image to compare strategies</div>';
      return;
    }

    // Find winner (smallest encoded bytes)
    let winnerIdx = 0;
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].encodedBytes < entries[winnerIdx].encodedBytes) {
        winnerIdx = i;
      }
    }

    let html = '<div class="arena-grid">';
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const ratio = e.rawBytes > 0 ? ((e.encodedBytes / e.rawBytes) * 100).toFixed(0) : '100';
      const isWinner = i === winnerIdx;
      html += `
        <div class="arena-card${isWinner ? ' arena-winner' : ''}">
          <canvas class="arena-preview" width="${PREVIEW_SIZE}" height="${PREVIEW_SIZE}" data-idx="${i}"></canvas>
          <div class="arena-name">${e.name}${isWinner ? ' ★' : ''}</div>
          <div class="arena-stat">${e.encodedBytes} B (${ratio}%)</div>
          <div class="arena-stat">${e.chunks} chunk${e.chunks !== 1 ? 's' : ''}</div>
        </div>`;
    }
    html += '</div>';
    this.container.innerHTML = html;

    // Draw previews
    const canvases = this.container.querySelectorAll<HTMLCanvasElement>('.arena-preview');
    canvases.forEach((cvs) => {
      const idx = parseInt(cvs.dataset.idx!);
      this.drawPreview(cvs, entries[idx], gridSize);
    });
  }

  private drawPreview(
    canvas: HTMLCanvasElement,
    entry: ArenaEntry,
    gridSize: number,
  ): void {
    const ctx = canvas.getContext('2d')!;
    const cell = PREVIEW_SIZE / gridSize;

    ctx.fillStyle = '#1a1a25';
    ctx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const idx = row * gridSize + col;
        const val = entry.pixels[idx] ?? 0;

        if (entry.palette && val < entry.palette.length) {
          const c = entry.palette[val];
          ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
        } else if (val > 0) {
          const brightness = entry.maxVal > 0 ? val / entry.maxVal : 1;
          const g = Math.round(0x88 + (0xff - 0x88) * brightness);
          ctx.fillStyle = `rgb(0, ${g}, ${Math.round(0x88 * brightness)})`;
        } else {
          continue; // leave dark background
        }

        ctx.fillRect(col * cell, row * cell, cell, cell);
      }
    }
  }
}

/** Re-quantize pixels from current level count to a target level count. */
function requantize(pixels: number[], fromLevels: number, toLevels: number): number[] {
  const fromMax = fromLevels - 1;
  const toMax = toLevels - 1;
  if (fromMax === 0) return pixels.map(v => v > 0 ? toMax : 0);
  return pixels.map(v => Math.round((v / fromMax) * toMax));
}
