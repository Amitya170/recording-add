/**
 * AudioWorkletRecorder — Thread-Isolated Audio Processing & PCM Stream Recorder.
 * Runs on a dedicated Web Audio thread, completely isolated from main-thread UI rendering,
 * eliminating audio stutter and glitching under high CPU loads.
 */

export const PCM_RECORDER_WORKLET_CODE = `
class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isRecording = true;
    this.bufferSize = 2048; // Batch ~42.6ms of audio at 48kHz (reduces postMessage from 375/s to ~23/s)
    this._buffer = new Float32Array(this.bufferSize);
    this._bufferIndex = 0;
    this._peak = 0;
    this._sumSq = 0;

    this.port.onmessage = (event) => {
      if (event.data && typeof event.data.isRecording === 'boolean') {
        this.isRecording = event.data.isRecording;
        if (!this.isRecording && this._bufferIndex > 0) {
          this.flush();
        }
      }
    };
  }

  flush() {
    if (this._bufferIndex === 0) return;
    const chunk = this._buffer.slice(0, this._bufferIndex);
    const rms = Math.sqrt(this._sumSq / this._bufferIndex);
    this.port.postMessage({
      type: 'pcm-data',
      buffer: chunk.buffer,
      peak: this._peak,
      rms: rms,
    }, [chunk.buffer]);
    this._bufferIndex = 0;
    this._peak = 0;
    this._sumSq = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0];
    if (!channelData || channelData.length === 0) return true;

    // Pass through to output so the Web Audio render clock remains active
    const output = outputs[0];
    if (output && output[0]) {
      output[0].set(channelData);
    }

    const len = channelData.length;
    for (let i = 0; i < len; i++) {
      const val = channelData[i];
      const abs = Math.abs(val);
      if (abs > this._peak) this._peak = abs;
      this._sumSq += val * val;

      this._buffer[this._bufferIndex++] = val;
      if (this._bufferIndex >= this.bufferSize) {
        this.flush();
      }
    }

    return true;
  }
}

registerProcessor('pcm-recorder-processor', PcmRecorderProcessor);
`;

let workletBlobUrl: string | null = null;

export async function ensureAudioWorkletLoaded(ctx: AudioContext): Promise<boolean> {
  if (typeof ctx.audioWorklet === 'undefined' || typeof ctx.audioWorklet.addModule !== 'function') {
    return false;
  }

  if (!workletBlobUrl) {
    const blob = new Blob([PCM_RECORDER_WORKLET_CODE], { type: 'application/javascript' });
    workletBlobUrl = URL.createObjectURL(blob);
  }

  try {
    await ctx.audioWorklet.addModule(workletBlobUrl);
    return true;
  } catch (err) {
    // If already added, it's safe to continue
    if (String(err).includes('already been registered') || String(err).includes('already added')) {
      return true;
    }
    console.warn('AudioWorklet module load error, falling back to ScriptProcessor:', err);
    return false;
  }
}
