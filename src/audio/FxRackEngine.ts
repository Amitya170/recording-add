/**
 * DSP Effects Rack Engine
 * Chains BiquadFilter (High-Pass & 3-Band EQ), DynamicsCompressor, and Limiter nodes.
 */

export interface FxConfig {
  highPassFreq: number; // 0 = off, else 40, 80, 120, 200 Hz
  eqLowGain: number;   // -12 to +12 dB
  eqMidGain: number;   // -12 to +12 dB
  eqHighGain: number;  // -12 to +12 dB
  compEnabled: boolean;
  compThreshold: number; // -60 to 0 dB
  compRatio: number;     // 1 to 20
  compAttack: number;    // 0.001 to 0.1 s
  compRelease: number;   // 0.05 to 1.0 s
  limiterCeiling: number; // -3.0 to -0.1 dB
  masterGain: number;     // 0.0 to 2.0
}

export const DEFAULT_FX_CONFIG: FxConfig = {
  highPassFreq: 80,
  eqLowGain: 0,
  eqMidGain: 0,
  eqHighGain: 0,
  compEnabled: true,
  compThreshold: -18,
  compRatio: 4,
  compAttack: 0.005,
  compRelease: 0.1,
  limiterCeiling: -0.5,
  masterGain: 1.0,
};

export class FxRackEngine {
  private ctx: AudioContext;
  public inputNode: GainNode;
  public outputNode: GainNode;

  private highPassFilter: BiquadFilterNode;
  private eqLowNode: BiquadFilterNode;
  private eqMidNode: BiquadFilterNode;
  private eqHighNode: BiquadFilterNode;
  private compressorNode: DynamicsCompressorNode;
  private limiterNode: DynamicsCompressorNode;
  private masterGainNode: GainNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // Initialize Nodes
    this.inputNode = ctx.createGain();
    this.highPassFilter = ctx.createBiquadFilter();
    this.eqLowNode = ctx.createBiquadFilter();
    this.eqMidNode = ctx.createBiquadFilter();
    this.eqHighNode = ctx.createBiquadFilter();
    this.compressorNode = ctx.createDynamicsCompressor();
    this.limiterNode = ctx.createDynamicsCompressor();
    this.masterGainNode = ctx.createGain();
    this.outputNode = ctx.createGain();

    // Node Types & Parameters
    this.highPassFilter.type = 'highpass';
    this.highPassFilter.frequency.value = 80;

    this.eqLowNode.type = 'lowshelf';
    this.eqLowNode.frequency.value = 120; // Bass

    this.eqMidNode.type = 'peaking';
    this.eqMidNode.frequency.value = 1500; // Presence
    this.eqMidNode.Q.value = 1.0;

    this.eqHighNode.type = 'highshelf';
    this.eqHighNode.frequency.value = 8000; // Air

    // Compressor defaults
    this.compressorNode.threshold.value = -18;
    this.compressorNode.knee.value = 12;
    this.compressorNode.ratio.value = 4;
    this.compressorNode.attack.value = 0.005;
    this.compressorNode.release.value = 0.1;

    // Brickwall Limiter node (Ratio 20:1, Knee 0)
    this.limiterNode.threshold.value = -0.5;
    this.limiterNode.knee.value = 0;
    this.limiterNode.ratio.value = 20;
    this.limiterNode.attack.value = 0.001;
    this.limiterNode.release.value = 0.05;

    // Connect Chain
    // Input -> HighPass -> EQ Low -> EQ Mid -> EQ High -> Compressor -> Limiter -> MasterGain -> Output
    this.inputNode
      .connect(this.highPassFilter)
      .connect(this.eqLowNode)
      .connect(this.eqMidNode)
      .connect(this.eqHighNode)
      .connect(this.compressorNode)
      .connect(this.limiterNode)
      .connect(this.masterGainNode)
      .connect(this.outputNode);

    this.updateConfig(DEFAULT_FX_CONFIG);
  }

  public updateConfig(config: FxConfig) {
    const now = this.ctx.currentTime;

    // High Pass Filter
    if (config.highPassFreq <= 0) {
      this.highPassFilter.frequency.setValueAtTime(10, now); // effectively bypassed
    } else {
      this.highPassFilter.frequency.setValueAtTime(config.highPassFreq, now);
    }

    // 3-Band EQ
    this.eqLowNode.gain.setValueAtTime(config.eqLowGain, now);
    this.eqMidNode.gain.setValueAtTime(config.eqMidGain, now);
    this.eqHighNode.gain.setValueAtTime(config.eqHighGain, now);

    // Studio Compressor
    if (config.compEnabled) {
      this.compressorNode.threshold.setValueAtTime(config.compThreshold, now);
      this.compressorNode.ratio.setValueAtTime(config.compRatio, now);
      this.compressorNode.attack.setValueAtTime(config.compAttack, now);
      this.compressorNode.release.setValueAtTime(config.compRelease, now);
    } else {
      this.compressorNode.threshold.setValueAtTime(0, now);
      this.compressorNode.ratio.setValueAtTime(1, now);
    }

    // Limiter
    this.limiterNode.threshold.setValueAtTime(config.limiterCeiling, now);

    // Master Gain
    this.masterGainNode.gain.setValueAtTime(config.masterGain, now);
  }
}
