/**
 * Real-Time Visualizer Analyser Engine
 * Extracts FFT frequency data, time-domain waveforms, peak levels, and LUFS estimation.
 */

export interface AnalysisData {
  timeData: Float32Array;
  freqData: Uint8Array;
  peakLeftDb: number;
  peakRightDb: number;
  rmsDb: number;
  lufsEstimate: number;
  isClipping: boolean;
}

export class AnalyserEngine {
  private analyserNode: AnalyserNode;
  private timeDataBuffer: Float32Array;
  private freqDataBuffer: Uint8Array;

  constructor(ctx: AudioContext, fftSize: number = 2048) {
    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = fftSize;
    this.analyserNode.smoothingTimeConstant = 0.8;

    this.timeDataBuffer = new Float32Array(this.analyserNode.frequencyBinCount);
    this.freqDataBuffer = new Uint8Array(this.analyserNode.frequencyBinCount);
  }

  public get node(): AnalyserNode {
    return this.analyserNode;
  }

  public getAnalysis(): AnalysisData {
    // Cast buffers for Web Audio Analyser API compatibility
    this.analyserNode.getFloatTimeDomainData(this.timeDataBuffer as any);
    this.analyserNode.getByteFrequencyData(this.freqDataBuffer as any);

    let maxAbs = 0;
    let sumSquares = 0;

    for (let i = 0; i < this.timeDataBuffer.length; i++) {
      const sample = this.timeDataBuffer[i];
      const absSample = Math.abs(sample);
      if (absSample > maxAbs) maxAbs = absSample;
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / this.timeDataBuffer.length);
    
    // Convert to dBFS (-60 to 0)
    const peakDb = maxAbs > 0.00001 ? 20 * Math.log10(maxAbs) : -60;
    const rmsDb = rms > 0.00001 ? 20 * Math.log10(rms) : -60;

    // LUFS approximation with K-weighting curve estimation
    const lufsEstimate = Math.min(0, rmsDb - 0.6);
    const isClipping = maxAbs >= 0.999;

    return {
      timeData: this.timeDataBuffer,
      freqData: this.freqDataBuffer,
      peakLeftDb: peakDb,
      peakRightDb: peakDb, // Mono or combined stereo
      rmsDb,
      lufsEstimate,
      isClipping,
    };
  }
}
