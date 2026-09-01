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
    this.port.onmessage = (event) => {
      if (event.data && typeof event.data.isRecording === 'boolean') {
        this.isRecording = event.data.isRecording;
      }
    };
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

    // Fast metering calculation
    let peak = 0;
    let sumSq = 0;
    const len = channelData.length;
    const copy = new Float32Array(len);

    for (let i = 0; i < len; i++) {
      const val = channelData[i];
      copy[i] = val;
      const abs = Math.abs(val);
      if (abs > peak) peak = abs;
      sumSq += val * val;
    }

    const rms = Math.sqrt(sumSq / len);

    // Stream audio buffer and telemetry to main thread
    this.port.postMessage({
      type: 'pcm-data',
      buffer: copy.buffer,
      peak,
      rms,
    }, [copy.buffer]);

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
