/**
 * DSP Effects Rack Engine
 * Chains High-Pass Filter, Parametric 3-Band EQ, Noise Gate, Dynamics Compressor, and Brickwall Limiter.
 */

export interface FxConfig {
  highPassFreq: number; // 0 = off, else 40 to 300 Hz
  eqLowFreq: number;    // 60 to 250 Hz
  eqLowGain: number;    // -15 to +15 dB
  eqMidFreq: number;    // 400 to 6000 Hz
  eqMidQ: number;       // 0.2 to 5.0 Q-factor
  eqMidGain: number;    // -15 to +15 dB
  eqHighFreq: number;   // 6000 to 16000 Hz
  eqHighGain: number;   // -15 to +15 dB
  gateEnabled: boolean;
  gateThresholdDb: number; // -80 to -15 dBFS
  gateReleaseMs: number;   // 20 to 500 ms
  compEnabled: boolean;
  compThreshold: number; // -50 to 0 dBFS
  compRatio: number;     // 1 to 20
  compAttack: number;    // 0.001 to 0.1 s
  compRelease: number;   // 0.05 to 1.0 s
  limiterCeiling: number; // -3.0 to -0.1 dBFS
  masterGain: number;     // 0.0 to 2.0
}

export const DEFAULT_FX_CONFIG: FxConfig = {
  highPassFreq: 80,
  eqLowFreq: 120,
  eqLowGain: 0,
  eqMidFreq: 2500,
  eqMidQ: 1.0,
  eqMidGain: 0,
  eqHighFreq: 10000,
  eqHighGain: 0,
  gateEnabled: true,
  gateThresholdDb: -45,
  gateReleaseMs: 80,
  compEnabled: true,
  compThreshold: -18,
  compRatio: 4,
  compAttack: 0.005,
  compRelease: 0.1,
  limiterCeiling: -0.5,
  masterGain: 1.0,
};

export const VOCAL_PRESETS: Record<string, FxConfig> = {
  warm: {
    highPassFreq: 80,
    eqLowFreq: 110,
    eqLowGain: 3.5,
    eqMidFreq: 2200,
    eqMidQ: 0.9,
    eqMidGain: 1.5,
    eqHighFreq: 11000,
    eqHighGain: 3.0,
    gateEnabled: true,
    gateThresholdDb: -44,
    gateReleaseMs: 80,
    compEnabled: true,
    compThreshold: -16,
    compRatio: 3.5,
    compAttack: 0.005,
    compRelease: 0.1,
    limiterCeiling: -0.5,
    masterGain: 1.0,
  },
  radio: {
    highPassFreq: 100,
    eqLowFreq: 140,
    eqLowGain: 4.5,
    eqMidFreq: 3000,
    eqMidQ: 1.2,
    eqMidGain: 3.5,
    eqHighFreq: 9500,
    eqHighGain: 4.0,
    gateEnabled: true,
    gateThresholdDb: -40,
    gateReleaseMs: 70,
    compEnabled: true,
    compThreshold: -22,
    compRatio: 6.0,
    compAttack: 0.003,
    compRelease: 0.08,
    limiterCeiling: -0.3,
    masterGain: 1.05,
  },
  crisp: {
    highPassFreq: 90,
    eqLowFreq: 100,
    eqLowGain: -1.0,
    eqMidFreq: 3500,
    eqMidQ: 1.1,
    eqMidGain: 2.5,
    eqHighFreq: 12000,
    eqHighGain: 5.0,
    gateEnabled: true,
    gateThresholdDb: -46,
    gateReleaseMs: 90,
    compEnabled: true,
    compThreshold: -18,
    compRatio: 4.0,
    compAttack: 0.004,
    compRelease: 0.1,
    limiterCeiling: -0.5,
    masterGain: 1.0,
  },
  gate: {
    highPassFreq: 100,
    eqLowFreq: 120,
    eqLowGain: 0,
    eqMidFreq: 2500,
    eqMidQ: 1.0,
    eqMidGain: 0,
    eqHighFreq: 10000,
    eqHighGain: 0,
    gateEnabled: true,
    gateThresholdDb: -36,
    gateReleaseMs: 50,
    compEnabled: true,
    compThreshold: -20,
    compRatio: 5.0,
    compAttack: 0.003,
    compRelease: 0.08,
    limiterCeiling: -0.5,
    masterGain: 1.0,
  },
  flat: {
    highPassFreq: 0,
    eqLowFreq: 120,
    eqLowGain: 0,
    eqMidFreq: 2500,
    eqMidQ: 1.0,
    eqMidGain: 0,
    eqHighFreq: 10000,
    eqHighGain: 0,
    gateEnabled: false,
    gateThresholdDb: -80,
    gateReleaseMs: 100,
    compEnabled: false,
    compThreshold: 0,
    compRatio: 1,
    compAttack: 0.01,
    compRelease: 0.1,
    limiterCeiling: -0.5,
    masterGain: 1.0,
  },
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
    this.eqLowNode.frequency.value = 120;

    this.eqMidNode.type = 'peaking';
    this.eqMidNode.frequency.value = 2500;
    this.eqMidNode.Q.value = 1.0;

    this.eqHighNode.type = 'highshelf';
    this.eqHighNode.frequency.value = 10000;

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

    // Connect Chain: Input -> HighPass -> EQ Low -> EQ Mid -> EQ High -> Compressor -> Limiter -> MasterGain -> Output
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

    // Parametric 3-Band EQ
    this.eqLowNode.frequency.setValueAtTime(config.eqLowFreq || 120, now);
    this.eqLowNode.gain.setValueAtTime(config.eqLowGain, now);

    this.eqMidNode.frequency.setValueAtTime(config.eqMidFreq || 2500, now);
    this.eqMidNode.Q.setValueAtTime(config.eqMidQ || 1.0, now);
    this.eqMidNode.gain.setValueAtTime(config.eqMidGain, now);

    this.eqHighNode.frequency.setValueAtTime(config.eqHighFreq || 10000, now);
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

  public applyPreset(presetKey: string): FxConfig {
    const preset = VOCAL_PRESETS[presetKey] || DEFAULT_FX_CONFIG;
    this.updateConfig(preset);
    return preset;
  }
}


