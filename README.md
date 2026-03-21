# wavepx

Transmit files, images, and data between devices using sound.

Built on [ggwave](https://github.com/ggerganov/ggwave). TypeScript library + web app. Fountain codes for reliable file transfer, deflate compression, QR codes, pixel art, grayscale/palette images, dithering, and a battleship game — all over audio.

## Quick start

```bash
npx wavepx              # serve the app on localhost:3000
npx wavepx -p 8080      # custom port
```

```bash
npm install wavepx       # add as a dependency
```

## Features

- **Draw** — 1-bit pixel art editor (up to 32x32 in a single frame, larger via chunked multi-frame)
- **Image** — grayscale (2-bit, 4-bit) and palette (up to 16 colors) image transmission with RLE compression and dithering
- **QR** — encode/decode QR codes (versions 1-4, EC levels L/M/Q/H) and transmit the module grid
- **Text** — send UTF-8 text messages (up to 138 bytes per frame)
- **Transfer** — reliable file transfer (up to 64KB) using fountain codes with deflate compression, CRC-32 verification, and a SYN/SYN_ACK/DATA/DONE handshake
- **Arena** — compression arena for comparing dithering algorithms and bit-depth encodings side by side
- **Game** — two-player battleship over audio with ship placement, shots, results, and win detection

## Library API

```typescript
import { SonicPixel, FrameType, SonicState } from 'wavepx';

const sonic = new SonicPixel({
  onReceive: (msg) => {
    switch (msg.type) {
      case FrameType.QR:   console.log('QR:', msg.size, 'x', msg.size); break;
      case FrameType.IMG:  console.log('IMG:', msg.width, 'x', msg.height); break;
      case FrameType.TXT:  console.log('TXT:', msg.text); break;
      case FrameType.CHUNK: console.log('Chunked image:', msg.width, 'x', msg.height, msg.bitDepth, 'bpp'); break;
    }
  },
  onGameMessage: (msg) => console.log('Game:', msg),
  onTransferMessage: (msg) => console.log('Transfer:', msg),
  onChunkProgress: (pixels, w, h, bpp, progress) => console.log(`Chunk progress: ${(progress * 100).toFixed(0)}%`),
  onStateChange: (state) => console.log('State:', state),
  onError: (err) => console.error(err),
});

// Initialize (must be called from a user gesture in browsers)
await sonic.init();
```

### sendText

```typescript
await sonic.sendText('hello from wavepx');
```

### sendQr

```typescript
import { ECLevel } from 'wavepx';
await sonic.sendQr('https://example.com', { ecLevel: ECLevel.M, version: 2 });
```

### sendImage

Sends a 1-bit image. Falls back to chunked multi-frame for images larger than a single 140-byte payload.

```typescript
const pixels = new Array(16 * 16).fill(false);
pixels[0] = true; // top-left pixel
await sonic.sendImage(16, 16, pixels);
```

### sendChunkedImage

Explicitly chunked 1-bit image with progress callback.

```typescript
await sonic.sendChunkedImage(64, 64, pixels, (sent, total) => {
  console.log(`${sent}/${total} chunks`);
});
```

### sendGrayImage

Grayscale image with configurable bit depth (1, 2, or 4 bits per pixel).

```typescript
const gray = new Array(32 * 32).fill(0).map((_, i) => i % 16); // 4-bit values
await sonic.sendGrayImage(32, 32, gray, 4, (sent, total) => {
  console.log(`${sent}/${total}`);
});
```

### sendPaletteImage

Indexed-color image with a palette of up to 16 RGB colors.

```typescript
import { quantizeColors } from 'wavepx';
const { indices, palette } = quantizeColors(rgbaPixels, 16);
await sonic.sendPaletteImage({ width: 32, height: 32, indices, palette });
```

### sendFileTransfer

Reliable file transfer with fountain codes, deflate compression, and CRC-32 verification.

```typescript
const fileData = new Uint8Array([/* up to 64KB */]).buffer;
await sonic.sendFileTransfer(fileData, 'notes.txt', (sent, total, state) => {
  console.log(`${state}: ${sent}/${total} frames`);
});
```

### startListening

```typescript
await sonic.startListening();
// ... incoming messages arrive via onReceive / onGameMessage / onTransferMessage callbacks
sonic.stopListening();
sonic.destroy();
```

### Lower-level exports

```typescript
import {
  encodeFrame, decodeFrame,                          // wire protocol encode/decode
  packBits, unpackBits, packValues, unpackValues,    // bit packing
  rleEncode, rleDecode,                              // run-length encoding
  encodeBlocks, FountainDecoder,                     // fountain codes
  encodeTransferFrame, decodeTransferFrame,          // transfer protocol
  TransferSenderSession, TransferReceiverSession,    // transfer session management
  encodeGameFrame, decodeGameFrame,                  // game protocol
  createGameState, placeShip, receiveShot,           // game state machine
  deflateCompress, deflateDecompress,                // deflate (browser only)
  ditherImage,                                       // Floyd-Steinberg, Atkinson, etc.
  quantizeColors, encodePaletteImage,                // color quantization
  waveformsToWav,                                    // export audio as WAV
} from 'wavepx';
```

## Wire protocol

All frames are single ggwave transmissions (max 140 bytes). Byte 0 identifies the frame type.

| Type     | Byte 0 | Header                                         | Payload                           |
|----------|--------|-------------------------------------------------|-----------------------------------|
| QR       | `0x01` | version/EC (1B) + proto ver (1B)                | Bit-packed QR modules             |
| IMG      | `0x02` | width (1B) + height (1B) + proto ver (1B)       | Bit-packed pixels                 |
| TXT      | `0x03` | proto ver (1B)                                  | UTF-8 text (up to 138B)          |
| CHUNK    | `0x04` | sequence/total/dimensions/bitDepth              | RLE-compressed pixel data         |
| GAME     | `0x05` | subtype (1B) + session fields                   | Setup/shot/result/win data        |
| TRANSFER | `0x06` | subtype (1B) + session ID + variable fields     | Fountain-coded file blocks        |

### Transfer subtypes

| Subtype  | Code   | Direction        | Purpose                                       |
|----------|--------|------------------|-----------------------------------------------|
| SYN      | `0x01` | Sender->Receiver | File metadata, block params, CRC-32           |
| SYN_ACK  | `0x02` | Receiver->Sender | Acknowledge, ready to receive                 |
| DATA     | `0x03` | Sender->Receiver | Fountain-coded block (index, degree, payload)  |
| DONE     | `0x04` | Receiver->Sender | CRC verified (success or mismatch)            |
| ABORT    | `0x05` | Either           | Cancel transfer (timeout, error, user cancel) |

### Game subtypes

SETUP (ship placement hash), SHOT (coordinates), RESULT (hit/miss/sunk), WIN (game over).

## CLI usage

```
npx wavepx [options]

Options:
  -p, --port <number>   Port to serve on (default: 3000)
```

Serves the built web app. Open on two devices in the same room — transmit data between them using speaker/microphone.

## Architecture

Five-layer stack:

```
 App UI          app/components/*.ts — panels for each mode
   |
 SonicPixel      lib/wavepx.ts — high-level API, send/receive orchestration
   |
 Protocol        lib/protocol.ts, lib/chunked.ts, lib/game-protocol.ts, lib/transfer-protocol.ts
   |
 Codec           lib/bitpack.ts, lib/rle.ts, lib/fountain.ts, lib/deflate.ts, lib/palette.ts, lib/dither.ts
   |
 Transport       lib/transport.ts (ggwave FFI) + lib/audio.ts (Web Audio capture/playback)
```

## Project structure

```
lib/           wavepx library (ES module, published to npm)
app/           Web app (Vite SPA)
bin/           CLI entry point
test/          Unit tests (vitest)
```

## Development

```bash
npm install
npm run dev          # start Vite dev server
npm test             # run tests (vitest)
npm run build        # build lib + app
npm run build:lib    # build library only
npm run build:app    # build app only
```

## License

MIT
