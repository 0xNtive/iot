import { SonicProtocol } from './types.js';

export class GGWaveTransport {
  private instance: any = null;
  private gg: any = null;

  async init(): Promise<void> {
    const mod = await import('ggwave');
    const factory = mod.default || mod;
    this.gg = await factory();
    const params = this.gg.getDefaultParameters();
    params.sampleRateInp = 48000;
    params.sampleRateOut = 48000;
    // sampleFormatInp/Out default to F32 — leave as-is
    this.instance = this.gg.init(params);

    if (this.instance === null || this.instance === undefined) {
      throw new Error('ggwave init returned null instance');
    }
  }

  /**
   * Encode a payload into audio waveform for transmission.
   */
  encode(payload: Uint8Array, protocol: SonicProtocol, volume: number): Uint8Array {
    if (this.instance == null || !this.gg) {
      throw new Error('Transport not initialized');
    }

    // Pass payload as Uint8Array directly — embind copies raw bytes into std::string
    // (avoids UTF-8 mangling that happens with JS string → std::string conversion)
    const ggProto = this.getProtocolEnum(protocol);
    const waveform = this.gg.encode(this.instance, payload, ggProto, volume);
    return new Uint8Array(waveform);
  }

  /**
   * Decode received audio samples.
   */
  decode(samples: Float32Array): Uint8Array | null {
    if (this.instance == null || !this.gg) {
      throw new Error('Transport not initialized');
    }

    // Pass raw Float32 bytes as Uint8Array
    const rawBytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
    const result = this.gg.decode(this.instance, rawBytes);

    if (!result || result.length === 0) {
      return null;
    }

    const decoded = new Uint8Array(result.length);
    for (let i = 0; i < result.length; i++) {
      decoded[i] = result[i];
    }
    return decoded;
  }

  destroy(): void {
    if (this.instance != null && this.gg) {
      this.gg.free(this.instance);
      this.instance = null;
    }
  }

  private getProtocolEnum(protocol: SonicProtocol): any {
    const names = [
      'GGWAVE_PROTOCOL_AUDIBLE_NORMAL',
      'GGWAVE_PROTOCOL_AUDIBLE_FAST',
      'GGWAVE_PROTOCOL_AUDIBLE_FASTEST',
      'GGWAVE_PROTOCOL_ULTRASOUND_NORMAL',
      'GGWAVE_PROTOCOL_ULTRASOUND_FAST',
      'GGWAVE_PROTOCOL_ULTRASOUND_FASTEST',
      'GGWAVE_PROTOCOL_DT_NORMAL',
      'GGWAVE_PROTOCOL_DT_FAST',
      'GGWAVE_PROTOCOL_DT_FASTEST',
    ];
    const name = names[protocol];
    // Return the enum object itself, not .value — embind expects the enum type
    if (this.gg.ProtocolId && name && this.gg.ProtocolId[name] !== undefined) {
      return this.gg.ProtocolId[name];
    }
    // Fallback: try numeric
    return protocol as number;
  }
}
