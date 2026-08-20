/**
 * Dual-Speaker Podcast Audio Engine
 * Each speaker gets an independent SpeakerAudioEngine instance with its own
 * MediaStream, ScriptProcessorNode, GainNode, AnalyserEngine, and PCM recording buffer.
 */

import { AnalyserEngine, type AnalysisData } from './AnalyserEngine';
import { createAudioBufferFromPCM } from './AudioBufferUtils';
import { FxRackEngine, DEFAULT_FX_CONFIG, type FxConfig } from './FxRackEngine';
import { NoiseSuppressionEngine } from './NoiseSuppressionEngine';
import { ensureAudioWorkletLoaded } from './AudioWorkletRecorder';

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
  private workletNode: AudioWorkletNode | null = null;
  private isWorkletActive = false;
  private silentSink: GainNode | null = null;

  private isRecording = false;
  private isPaused = false;
  private recordedChunks: Float32Array[] = [];
  private totalSamples = 0;
  private isMuted = false;
  private userGain = 1.0; // 0.0 to 2.0

  public noiseEngine: NoiseSuppressionEngine | null = null;
  public fxRack: FxRackEngine | null = null;
  public fxConfig: FxConfig = { ...DEFAULT_FX_CONFIG };

  public speakerLabel: string;
  public meterCallback: ((data: SpeakerMeterData) => void) | null = null;
  public monitorOutput: boolean = false;

  constructor(label: string, monitorOutput: boolean = false) {
    this.speakerLabel = label;
    this.monitorOutput = monitorOutput;
  }

  public get mediaStream(): MediaStream | null {
    return this.stream;
  }

  public async init(sharedCtx?: AudioContext, sampleRate: number = 44100): Promise<AudioContext> {
    if (sharedCtx) {
      this.ctx = sharedCtx;
    } else {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ sampleRate });
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    }

    // Try loading AudioWorklet processor module
    this.isWorkletActive = await ensureAudioWorkletLoaded(this.ctx);

    this.noiseEngine = new NoiseSuppressionEngine(this.ctx);
    this.fxRack = new FxRackEngine(this.ctx);
    this.analyserEngine = new AnalyserEngine(this.ctx, 2048);
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = this.userGain;

    // Chain: NoiseSuppression -> FxRack -> GainNode -> AnalyserEngine
    this.noiseEngine.outputNode.connect(this.fxRack.inputNode);
    this.fxRack.outputNode.connect(this.gainNode);
    this.gainNode.connect(this.analyserEngine.node);

    // If monitoring is enabled (e.g. for remote audio), connect gainNode to speakers
    if (this.monitorOutput) {
      this.gainNode.connect(this.ctx.destination);
    }

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
      console.warn('Ideal device constraint failed, falling back to default mic:', err);
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (this.sourceNode) this.sourceNode.disconnect();
    this.sourceNode = this.ctx.createMediaStreamSource(this.stream);

    // Audio Graph: sourceNode -> noiseEngine -> fxRack -> gainNode -> analyserEngine
    if (this.noiseEngine) {
      this.sourceNode.connect(this.noiseEngine.inputNode);
    } else if (this.fxRack) {
      this.sourceNode.connect(this.fxRack.inputNode);
    } else {
      this.sourceNode.connect(this.gainNode!);
    }

    this.setupAudioCaptureNode();
    this.applyMuteState();
  }

  public async startMediaStream(stream: MediaStream): Promise<void> {
    if (!this.ctx) throw new Error('Engine not initialized');

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.stream = stream;

    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch {}
      this.sourceNode = null;
    }

    this.sourceNode = this.ctx.createMediaStreamSource(this.stream);
    this.sourceNode.connect(this.gainNode!);
    this.gainNode!.connect(this.analyserEngine!.node);

    if (this.monitorOutput) {
      this.gainNode!.connect(this.ctx.destination);
    }

    this.setupAudioCaptureNode();
    this.applyMuteState();
  }

  private setupAudioCaptureNode() {
    if (!this.ctx || !this.gainNode) return;

    // Clean up any existing capture nodes
    if (this.workletNode) {
      try { this.workletNode.disconnect(); } catch {}
      this.workletNode = null;
    }
    if (this.scriptNode) {
      try { this.scriptNode.disconnect(); } catch {}
      this.scriptNode = null;
    }
    if (this.silentSink) {
      try { this.silentSink.disconnect(); } catch {}
      this.silentSink = null;
    }

    // Try AudioWorklet thread isolation first
    if (this.isWorkletActive) {
      try {
        this.workletNode = new AudioWorkletNode(this.ctx, 'pcm-recorder-processor');
        this.workletNode.port.onmessage = (event) => {
          const { buffer, peak, rms } = event.data;
          if (this.meterCallback) {
            this.meterCallback({ peak, rms });
          }

          if (this.isRecording && !this.isPaused && !this.isMuted && buffer) {
            const chunk = new Float32Array(buffer);
            this.recordedChunks.push(chunk);
            this.totalSamples += chunk.length;
          }
        };

        this.gainNode.connect(this.workletNode);
        return;
      } catch (err) {
        console.warn('AudioWorkletNode instantiation failed, using ScriptProcessor fallback:', err);
      }
    }

    // High-reliability ScriptProcessorNode Fallback
    this.scriptNode = this.ctx.createScriptProcessor(2048, 1, 1);
    this.scriptNode.onaudioprocess = (e: AudioProcessingEvent) => {
      const rawInput = e.inputBuffer.getChannelData(0);

      let peak = 0, sumSq = 0;
      const processed = new Float32Array(rawInput.length);
      for (let i = 0; i < rawInput.length; i++) {
        const val = rawInput[i];
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

    this.gainNode.connect(this.scriptNode);

    this.silentSink = this.ctx.createGain();
    this.silentSink.gain.value = 0;
    this.scriptNode.connect(this.silentSink);
    this.silentSink.connect(this.ctx.destination);
  }

  public setNoiseSuppression(enabled: boolean): void {
    if (this.noiseEngine) {
      this.noiseEngine.setEnabled(enabled);
    }
  }

  public applyVocalPreset(presetKey: string): FxConfig {
    if (this.fxRack) {
      this.fxConfig = this.fxRack.applyPreset(presetKey);
      if (this.noiseEngine) {
        this.noiseEngine.setEnabled(this.fxConfig.gateEnabled);
        this.noiseEngine.setThresholdDb(this.fxConfig.gateThresholdDb);
      }
    }
    return this.fxConfig;
  }

  public updateFxConfig(config: FxConfig): void {
    this.fxConfig = { ...config };
    if (this.fxRack) {
      this.fxRack.updateConfig(this.fxConfig);
    }
    if (this.noiseEngine) {
      this.noiseEngine.setEnabled(this.fxConfig.gateEnabled);
      this.noiseEngine.setThresholdDb(this.fxConfig.gateThresholdDb);
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
    this.applyMuteState();
    return this.isMuted;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.applyMuteState();
  }

  public applyMuteState(): void {
    if (this.gainNode) {
      const targetGain = this.isMuted ? 0 : this.userGain;
      if (this.ctx) {
        try {
          this.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
          this.gainNode.gain.setValueAtTime(targetGain, this.ctx.currentTime);
        } catch {
          this.gainNode.gain.value = targetGain;
        }
      } else {
        this.gainNode.gain.value = targetGain;
      }
    }
    // NOTE: We intentionally do NOT set track.enabled on the MediaStream here.
    // The GainNode handles muting for local recording/metering. Setting
    // track.enabled = false would kill the audio for ALL consumers of the track,
    // including WebRTC RTCPeerConnection, causing silence for the remote peer.
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
