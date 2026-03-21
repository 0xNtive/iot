const SAMPLE_RATE = 48000;
const BUFFER_SIZE = 1024;

// Inline AudioWorklet processor — runs on audio thread, sends samples to main thread
const WORKLET_CODE = `
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      const copy = new Float32Array(input[0]);
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor('wavepx-capture', CaptureProcessor);
`;

export class AudioManager {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private frequencyData: Uint8Array | null = null;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private captureNode: AudioWorkletNode | ScriptProcessorNode | null = null;
  private useWorklet = false;
  private onAudioData: ((samples: Float32Array) => void) | null = null;
  private onAudioLevel: ((level: number) => void) | null = null;
  private sampleBuffer: Float32Array | null = null;
  private sampleOffset = 0;
  private playingSource: AudioBufferSourceNode | null = null;
  private playReject: (() => void) | null = null;

  async init(): Promise<void> {
    this.audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    // AnalyserNode for real-time frequency visualization
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256; // 128 frequency bins
    this.analyser.smoothingTimeConstant = 0.7;
    this.analyser.connect(this.audioCtx.destination);
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

    // Try to register AudioWorklet processor
    if (this.audioCtx.audioWorklet) {
      try {
        const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        await this.audioCtx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        this.useWorklet = true;
      } catch {
        this.useWorklet = false;
      }
    }
  }

  /** Get current frequency spectrum data (0-255 per bin, 128 bins). */
  getFrequencyData(): Uint8Array | null {
    if (!this.analyser || !this.frequencyData) return null;
    this.analyser.getByteFrequencyData(this.frequencyData as Uint8Array<ArrayBuffer>);
    return this.frequencyData;
  }

  async startCapture(
    onData: (samples: Float32Array) => void,
    onLevel?: (level: number) => void
  ): Promise<void> {
    if (!this.audioCtx) throw new Error('AudioManager not initialized');

    this.onAudioData = onData;
    this.onAudioLevel = onLevel ?? null;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false,
      },
    });

    this.sourceNode = this.audioCtx.createMediaStreamSource(this.stream);

    if (this.useWorklet) {
      // AudioWorklet sends 128-sample render quanta — buffer to BUFFER_SIZE
      // for ggwave compatibility (needs larger FFT windows)
      this.sampleBuffer = new Float32Array(BUFFER_SIZE);
      this.sampleOffset = 0;

      const worklet = new AudioWorkletNode(this.audioCtx, 'wavepx-capture');
      worklet.port.onmessage = (e: MessageEvent) => {
        const chunk = e.data as Float32Array;
        if (!this.sampleBuffer) return;

        let chunkOffset = 0;
        while (chunkOffset < chunk.length) {
          const space = BUFFER_SIZE - this.sampleOffset;
          const toCopy = Math.min(space, chunk.length - chunkOffset);
          this.sampleBuffer.set(chunk.subarray(chunkOffset, chunkOffset + toCopy), this.sampleOffset);
          this.sampleOffset += toCopy;
          chunkOffset += toCopy;

          if (this.sampleOffset >= BUFFER_SIZE) {
            this.handleSamples(new Float32Array(this.sampleBuffer));
            this.sampleOffset = 0;
          }
        }
      };
      this.sourceNode.connect(worklet);
      worklet.connect(this.analyser ?? this.audioCtx.destination);
      this.captureNode = worklet;
    } else {
      // Fallback to deprecated ScriptProcessorNode
      const processor = this.audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);
      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        this.handleSamples(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      this.sourceNode.connect(processor);
      processor.connect(this.analyser ?? this.audioCtx.destination);
      this.captureNode = processor;
    }
  }

  stopCapture(): void {
    if (this.captureNode) {
      this.captureNode.disconnect();
      if (this.captureNode instanceof AudioWorkletNode) {
        this.captureNode.port.onmessage = null;
      }
      this.captureNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.onAudioData = null;
    this.onAudioLevel = null;
    this.sampleBuffer = null;
    this.sampleOffset = 0;
  }

  /**
   * Play raw audio waveform bytes from ggwave encode.
   * ggwave outputs raw PCM — the sample format matches sampleFormatOut
   * which defaults to F32 (Float32 samples packed as bytes).
   */
  async play(waveform: Uint8Array): Promise<void> {
    if (!this.audioCtx) throw new Error('AudioManager not initialized');

    // ggwave encode output is Float32 PCM samples stored as raw bytes
    const numSamples = Math.floor(waveform.length / 4);
    if (numSamples === 0) throw new Error('Empty waveform');

    // Need to copy into an aligned buffer for Float32Array
    const aligned = new ArrayBuffer(numSamples * 4);
    new Uint8Array(aligned).set(waveform.subarray(0, numSamples * 4));
    const float32 = new Float32Array(aligned);

    const buffer = this.audioCtx.createBuffer(1, float32.length, SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser ?? this.audioCtx.destination);

    return new Promise<void>((resolve, reject) => {
      this.playingSource = source;
      this.playReject = () => reject(new Error('Playback aborted'));
      source.onended = () => {
        this.playingSource = null;
        this.playReject = null;
        resolve();
      };
      source.start();
    });
  }

  /** Stop currently playing audio immediately. */
  stopPlayback(): void {
    if (this.playingSource) {
      try { this.playingSource.stop(); } catch { /* already stopped */ }
      this.playingSource = null;
    }
    if (this.playReject) {
      this.playReject();
      this.playReject = null;
    }
  }

  destroy(): void {
    this.stopCapture();
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }

  private handleSamples(samples: Float32Array): void {
    if (this.onAudioLevel) {
      let sum = 0;
      for (let i = 0; i < samples.length; i++) {
        sum += Math.abs(samples[i]);
      }
      this.onAudioLevel(sum / samples.length);
    }
    if (this.onAudioData) {
      this.onAudioData(samples);
    }
  }
}

/**
 * Convert ggwave raw waveform(s) into a downloadable WAV file.
 * Accepts one or more Uint8Array waveforms (Float32 PCM at 48kHz).
 * Concatenates them with silence gaps between chunks.
 */
export function waveformsToWav(waveforms: Uint8Array[], gapMs = 50): Blob {
  const sampleRate = SAMPLE_RATE;
  const gapSamples = Math.floor(sampleRate * gapMs / 1000);

  // Calculate total samples
  let totalSamples = 0;
  for (const wf of waveforms) {
    totalSamples += Math.floor(wf.length / 4); // Float32 = 4 bytes
    totalSamples += gapSamples;
  }
  if (waveforms.length > 0) totalSamples -= gapSamples; // no trailing gap

  // Convert all Float32 waveforms to Int16
  const int16 = new Int16Array(totalSamples);
  let offset = 0;

  for (let w = 0; w < waveforms.length; w++) {
    const wf = waveforms[w];
    const numSamples = Math.floor(wf.length / 4);
    const aligned = new ArrayBuffer(numSamples * 4);
    new Uint8Array(aligned).set(wf.subarray(0, numSamples * 4));
    const float32 = new Float32Array(aligned);

    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[offset++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Add silence gap (except after last chunk)
    if (w < waveforms.length - 1) {
      for (let i = 0; i < gapSamples; i++) {
        int16[offset++] = 0;
      }
    }
  }

  // Build WAV
  const dataSize = int16.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);        // chunk size
  view.setUint16(20, 1, true);         // PCM
  view.setUint16(22, 1, true);         // mono
  view.setUint32(24, sampleRate, true); // sample rate
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);         // block align
  view.setUint16(34, 16, true);        // bits per sample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const wavBytes = new Uint8Array(buffer);
  const int16Bytes = new Uint8Array(int16.buffer);
  wavBytes.set(int16Bytes, 44);

  return new Blob([wavBytes], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
