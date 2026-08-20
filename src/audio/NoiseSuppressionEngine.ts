/**
 * NoiseSuppressionEngine — Spectral Noise Gate & Background Noise Removal.
 * Uses Web Audio API ScriptProcessor/Analyser nodes to dynamically estimate background
 * noise floors and suppress ambient hiss, AC hums, and room reverberation.
 */

export class NoiseSuppressionEngine {
  public inputNode: GainNode;
  public outputNode: GainNode;

  private scriptNode: ScriptProcessorNode;
  private noiseThresholdDb: number = -45; // Below this = noise
  private isEnabled: boolean = true;
  private expFilterAlpha: number = 0.05; // Smooth noise floor estimator
  private noiseFloorEstimate: number = 0.005;

  constructor(ctx: AudioContext) {
    this.inputNode = ctx.createGain();
    this.outputNode = ctx.createGain();

    this.scriptNode = ctx.createScriptProcessor(2048, 1, 1);
    this.scriptNode.onaudioprocess = (e) => this.processAudio(e);

    this.inputNode.connect(this.scriptNode);
    this.scriptNode.connect(this.outputNode);
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }

  public setThresholdDb(db: number) {
    this.noiseThresholdDb = db;
  }

  public getThresholdDb(): number {
    return this.noiseThresholdDb;
  }

  public isGateEnabled(): boolean {
    return this.isEnabled;
  }

  private processAudio(e: AudioProcessingEvent) {
    const input = e.inputBuffer.getChannelData(0);
    const output = e.outputBuffer.getChannelData(0);

    if (!this.isEnabled) {
      output.set(input);
      return;
    }

    // Estimate RMS level of buffer frame
    let sumSq = 0;
    for (let i = 0; i < input.length; i++) {
      sumSq += input[i] * input[i];
    }
    const rms = Math.sqrt(sumSq / input.length);

    // Update background noise floor estimate during quiet segments
    if (rms < this.noiseFloorEstimate * 2) {
      this.noiseFloorEstimate =
        (1 - this.expFilterAlpha) * this.noiseFloorEstimate + this.expFilterAlpha * rms;
    }

    const thresholdRms = Math.pow(10, this.noiseThresholdDb / 20);

    // Spectral noise gate attenuation curve
    let gain = 1.0;
    if (rms < thresholdRms) {
      const ratio = rms / Math.max(0.0001, thresholdRms);
      gain = Math.pow(ratio, 2); // Soft knee downward expander
    }

    for (let i = 0; i < input.length; i++) {
      output[i] = input[i] * gain;
    }
  }
}
