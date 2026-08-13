// AudioWorkletProcessor — Dual-channel podcast recording
// Processes two input channels independently for Speaker A (L) and Speaker B (R)
class AudioRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.bufferA = new Float32Array(this.bufferSize);
    this.bufferB = new Float32Array(this.bufferSize);
    this.indexA = 0;
    this.indexB = 0;
    this.isRecording = false;

    this.port.onmessage = (event) => {
      if (event.data.command === 'START') {
        this.isRecording = true;
        this.indexA = 0;
        this.indexB = 0;
      } else if (event.data.command === 'STOP') {
        this.isRecording = false;
        if (this.indexA > 0) this.flushA();
        if (this.indexB > 0) this.flushB();
      } else if (event.data.command === 'PAUSE') {
        this.isRecording = false;
      }
    };
  }

  flushA() {
    this.port.postMessage({ type: 'AUDIO_CHUNK_A', buffer: this.bufferA.slice(0, this.indexA) });
    this.indexA = 0;
  }

  flushB() {
    this.port.postMessage({ type: 'AUDIO_CHUNK_B', buffer: this.bufferB.slice(0, this.indexB) });
    this.indexB = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const chA = input[0]; // Speaker A — first channel
    const chB = input.length > 1 ? input[1] : null; // Speaker B — second channel (if available)

    // Speaker A metering
    if (chA) {
      let sumA = 0, peakA = 0;
      for (let i = 0; i < chA.length; i++) {
        const abs = Math.abs(chA[i]);
        if (abs > peakA) peakA = abs;
        sumA += chA[i] * chA[i];
      }
      this.port.postMessage({ type: 'METER_A', peak: peakA, rms: Math.sqrt(sumA / chA.length) });

      if (this.isRecording) {
        for (let i = 0; i < chA.length; i++) {
          this.bufferA[this.indexA++] = chA[i];
          if (this.indexA >= this.bufferSize) this.flushA();
        }
      }
    }

    // Speaker B metering
    if (chB) {
      let sumB = 0, peakB = 0;
      for (let i = 0; i < chB.length; i++) {
        const abs = Math.abs(chB[i]);
        if (abs > peakB) peakB = abs;
        sumB += chB[i] * chB[i];
      }
      this.port.postMessage({ type: 'METER_B', peak: peakB, rms: Math.sqrt(sumB / chB.length) });

      if (this.isRecording) {
        for (let i = 0; i < chB.length; i++) {
          this.bufferB[this.indexB++] = chB[i];
          if (this.indexB >= this.bufferSize) this.flushB();
        }
      }
    }

    return true;
  }
}

registerProcessor('audio-recorder-processor', AudioRecorderProcessor);
