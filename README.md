# wavepx

Transmit QR codes & pixel art over sound. A TypeScript library + showcase web app built on [ggwave](https://github.com/ggerganov/ggwave).

## Try it

Open the deployed app on two devices (same room) and send pixel art, QR codes, or text messages between them using sound.

## Quick start

```bash
npm install
npm run dev        # Start dev server
npm test           # Run tests
npm run build:app  # Build for deployment
```

## Library usage

```typescript
import { SonicPixel, FrameType, SonicState } from 'wavepx';

const sonic = new SonicPixel({
  onReceive: (msg) => {
    switch (msg.type) {
      case FrameType.QR:
        console.log('QR received:', msg.size, 'x', msg.size);
        break;
      case FrameType.IMG:
        console.log('Image received:', msg.width, 'x', msg.height);
        break;
      case FrameType.TXT:
        console.log('Text received:', msg.text);
        break;
    }
  },
  onStateChange: (state) => console.log('State:', state),
});

// Initialize (must be called from a user gesture)
await sonic.init();

// Listen for incoming transmissions
await sonic.startListening();

// Send a QR code
await sonic.sendQr('https://example.com');

// Send pixel art (16x16 boolean array)
await sonic.sendImage(16, 16, pixels);

// Send text
await sonic.sendText('hello from wavepx');

// Cleanup
sonic.destroy();
```

## Wire protocol

All frames are single ggwave transmissions (max 140 bytes).

| Frame | Byte 0 | Header | Payload |
|-------|--------|--------|---------|
| QR    | `0x01` | version/EC (1B) + proto ver (1B) | Bit-packed modules |
| IMG   | `0x02` | width (1B) + height (1B) + proto ver (1B) | Bit-packed pixels |
| TXT   | `0x03` | proto ver (1B) | UTF-8 text (up to 138B) |

## Project structure

```
lib/           # wavepx library (ES module)
app/           # Showcase web app
test/          # Unit tests (vitest)
```

## License

MIT
