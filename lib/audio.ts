const SAMPLE_RATE = 48000;
const BUFFER_SIZE = 1024;

export class AudioManager {
  private audioCtx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private onAudioData: ((samples: Float32Array) => void) | null = null;
  private onAudioLevel: ((level: number) => void) | null = null;

  async init(): Promise<void> {
    this.audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
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
    this.processorNode = this.audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);

    this.processorNode.onaudioprocess = (e: AudioProcessingEvent) => {
      const input = e.inputBuffer.getChannelData(0);
      const samples = new Float32Array(input);

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
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioCtx.destination);
  }

  stopCapture(): void {
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
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
    source.connect(this.audioCtx.destination);

    return new Promise<void>((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
  }

  destroy(): void {
    this.stopCapture();
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}
