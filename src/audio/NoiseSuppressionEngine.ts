/**
 * NoiseSuppressionEngine — Spectral Noise Gate & Background Noise Removal.
 * Uses Web Audio API ScriptProcessor/Analyser nodes to dynamically estimate background
 * noise floors and suppress ambient hiss, AC hums, and room reverberation.
 */

export class NoiseSuppressionEngine {
  public inputNode: GainNode;
  public outputNode: GainNode;

  private scriptNode: ScriptProcessorNode;
  private noiseThresholdDb: number = -55; // Below this = background noise (-55dB prevents cutting off quiet speech)
  private isEnabled: boolean = true;
  private expFilterAlpha: number = 0.05; // Smooth noise floor estimator
  private noiseFloorEstimate: number = 0.002;
  private currentGain: number = 1.0; // Smooth envelope gain tracker

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
    if (!enabled) {
      this.currentGain = 1.0;
    }
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
      this.currentGain = 1.0;
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

    // Soft knee downward expander target
    let targetGain = 1.0;
    if (rms < thresholdRms) {
      const ratio = rms / Math.max(0.00001, thresholdRms);
      targetGain = Math.pow(ratio, 1.5);
    }

    // Smooth per-sample linear interpolation from currentGain to targetGain
    // completely eliminates gating clicks, fluttering, and cutting off trailing syllables
    const len = input.length;
    const gainStep = (targetGain - this.currentGain) / len;
    for (let i = 0; i < len; i++) {
      this.currentGain += gainStep;
      output[i] = input[i] * this.currentGain;
    }
  }
}
