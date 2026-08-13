/**
 * Dual-Speaker Podcast Audio Engine
 * Each speaker gets an independent SpeakerAudioEngine instance with its own
 * MediaStream, ScriptProcessorNode, GainNode, AnalyserEngine, and PCM recording buffer.
 */

import { AnalyserEngine, type AnalysisData } from './AnalyserEngine';
import { createAudioBufferFromPCM } from './AudioBufferUtils';
import { FxRackEngine, DEFAULT_FX_CONFIG, type FxConfig } from './FxRackEngine';

export interface DeviceInfo {
  deviceId: string;
  label: string;
}

export interface SpeakerMeterData {
  peak: number;
  rms: number;
}

export class SpeakerAudioEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserEngine: AnalyserEngine | null = null;
  private gainNode: GainNode | null = null;
  private scriptNode: ScriptProcessorNode | null = null;

  private isRecording = false;
  private isPaused = false;
  private recordedChunks: Float32Array[] = [];
  private totalSamples = 0;
  private isMuted = false;
  private userGain = 1.0; // 0.0 to 2.0

  public fxRack: FxRackEngine | null = null;
  public fxConfig: FxConfig = { ...DEFAULT_FX_CONFIG };

  public speakerLabel: string;
  public meterCallback: ((data: SpeakerMeterData) => void) | null = null;

  constructor(label: string) {
    this.speakerLabel = label;
  }

  public async init(sharedCtx?: AudioContext, sampleRate: number = 44100): Promise<AudioContext> {
    if (sharedCtx) {
      this.ctx = sharedCtx;
    } else {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ sampleRate });
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    }

    this.fxRack = new FxRackEngine(this.ctx);
    this.analyserEngine = new AnalyserEngine(this.ctx, 2048);
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = this.userGain;

    this.fxRack.outputNode.connect(this.gainNode);
    this.gainNode.connect(this.analyserEngine.node);
    return this.ctx;
  }

  public async startInputStream(deviceId?: string): Promise<void> {
    if (!this.ctx) throw new Error('Engine not initialized');

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
    }

    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: deviceId ? { ideal: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
      video: false,
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // Fallback to default audio input if ideal constraint failed
      console.warn('Ideal device constraint failed, falling back to default mic:', err);
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    if (this.sourceNode) this.sourceNode.disconnect();
    this.sourceNode = this.ctx.createMediaStreamSource(this.stream);

    if (this.scriptNode) {
      this.scriptNode.disconnect();
    }
    this.scriptNode = this.ctx.createScriptProcessor(2048, 1, 1);
    this.scriptNode.onaudioprocess = (e: AudioProcessingEvent) => {
      const rawInput = e.inputBuffer.getChannelData(0);

      // Metering & recording with applied gain
      let peak = 0, sumSq = 0;
      const gain = this.isMuted ? 0 : this.userGain;

      const processed = new Float32Array(rawInput.length);
      for (let i = 0; i < rawInput.length; i++) {
        const val = rawInput[i] * gain;
        processed[i] = val;
        const abs = Math.abs(val);
        if (abs > peak) peak = abs;
        sumSq += val * val;
      }
      const rms = Math.sqrt(sumSq / rawInput.length);
      if (this.meterCallback) {
        this.meterCallback({ peak, rms });
      }

      if (this.isRecording && !this.isPaused && !this.isMuted) {
        this.recordedChunks.push(processed);
        this.totalSamples += processed.length;
      }
    };

    if (this.fxRack) {
      this.sourceNode.connect(this.fxRack.inputNode);
    } else {
      this.sourceNode.connect(this.gainNode!);
    }
    this.sourceNode.connect(this.scriptNode);
    this.scriptNode.connect(this.ctx.destination);
  }

  public async startMediaStream(stream: MediaStream): Promise<void> {
    if (!this.ctx) throw new Error('Engine not initialized');

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
    }

    this.stream = stream;

    if (this.sourceNode) this.sourceNode.disconnect();
    this.sourceNode = this.ctx.createMediaStreamSource(this.stream);

    if (this.scriptNode) {
      this.scriptNode.disconnect();
    }
    this.scriptNode = this.ctx.createScriptProcessor(2048, 1, 1);
    this.scriptNode.onaudioprocess = (e: AudioProcessingEvent) => {
      const rawInput = e.inputBuffer.getChannelData(0);

      // Metering & recording with applied gain
      let peak = 0, sumSq = 0;
      const gain = this.isMuted ? 0 : this.userGain;

      const processed = new Float32Array(rawInput.length);
      for (let i = 0; i < rawInput.length; i++) {
        const val = rawInput[i] * gain;
        processed[i] = val;
        const abs = Math.abs(val);
        if (abs > peak) peak = abs;
        sumSq += val * val;
      }
      const rms = Math.sqrt(sumSq / rawInput.length);
      if (this.meterCallback) {
        this.meterCallback({ peak, rms });
      }

      if (this.isRecording && !this.isPaused && !this.isMuted) {
        this.recordedChunks.push(processed);
        this.totalSamples += processed.length;
      }
    };

    if (this.fxRack) {
      this.sourceNode.connect(this.fxRack.inputNode);
    } else {
      this.sourceNode.connect(this.gainNode!);
    }
    this.sourceNode.connect(this.scriptNode);
    this.scriptNode.connect(this.ctx.destination);
  }

  public updateFxConfig(config: FxConfig): void {
    this.fxConfig = { ...config };
    if (this.fxRack) {
      this.fxRack.updateConfig(this.fxConfig);
    }
  }

  public setGain(gainValue: number): void {
    this.userGain = Math.max(0, Math.min(2, gainValue));
    if (this.gainNode && !this.isMuted) {
      this.gainNode.gain.value = this.userGain;
    }
  }

  public getGain(): number {
    return this.userGain;
  }

  public startRecording(): void {
    if (!this.isRecording) {
      this.recordedChunks = [];
      this.totalSamples = 0;
    }
    this.isRecording = true;
    this.isPaused = false;
  }

  public pauseRecording(): void {
    this.isPaused = true;
  }

  public resumeRecording(): void {
    this.isPaused = false;
  }

  public stopRecording(): AudioBuffer | null {
    this.isRecording = false;
    this.isPaused = false;

    if (this.totalSamples === 0 || !this.ctx) return null;

    const merged = new Float32Array(this.totalSamples);
    let offset = 0;
    for (const chunk of this.recordedChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const buffer = createAudioBufferFromPCM(this.ctx, merged, this.ctx.sampleRate, 1);
    this.recordedChunks = [];
    this.totalSamples = 0;
    return buffer;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.gainNode) {
      this.gainNode.gain.value = this.isMuted ? 0 : this.userGain;
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public getAnalysis(): AnalysisData | null {
    return this.analyserEngine ? this.analyserEngine.getAnalysis() : null;
  }

  public get audioContext(): AudioContext | null {
    return this.ctx;
  }

  public dispose() {
    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
    }
  }
}

export async function getAudioDevices(): Promise<DeviceInfo[]> {
  try {
    // Request temporary microphone stream to unlock hardware labels across browsers
    const tmpStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    tmpStream.getTracks().forEach((track) => track.stop());
  } catch (err) {
    console.warn('Microphone permission not granted yet:', err);
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioInputs = devices.filter((d) => d.kind === 'audioinput');

  return audioInputs.map((d, index) => {
    let label = d.label;
    if (!label) {
      label = index === 0 ? 'Default Microphone' : `Microphone ${index + 1}`;
    }
    return {
      deviceId: d.deviceId,
      label,
    };
  });
}

export function mergeToStereo(
  ctx: BaseAudioContext,
  bufferA: AudioBuffer,
  bufferB: AudioBuffer
): AudioBuffer {
  const maxLen = Math.max(bufferA.length, bufferB.length);
  const sampleRate = bufferA.sampleRate;
  const stereo = ctx.createBuffer(2, maxLen, sampleRate);

  const leftData = stereo.getChannelData(0);
  const rightData = stereo.getChannelData(1);

  const srcA = bufferA.getChannelData(0);
  const srcB = bufferB.getChannelData(0);

  leftData.set(srcA);
  rightData.set(srcB);

  return stereo;
}
