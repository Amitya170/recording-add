/**
 * AudioBuffer Processing Utilities
 * Provides DAW-level operations: trimming, fading, normalization, silence removal, and concatenation.
 */

export function sliceAudioBuffer(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  startTime: number,
  endTime: number
): AudioBuffer {
  const startSample = Math.floor(Math.max(0, startTime) * buffer.sampleRate);
  const endSample = Math.min(buffer.length, Math.floor(endTime * buffer.sampleRate));
  const frameCount = Math.max(1, endSample - startSample);

  const newBuffer = ctx.createBuffer(
    buffer.numberOfChannels,
    frameCount,
    buffer.sampleRate
  );

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channelData = buffer.getChannelData(c);
    const newChannelData = newBuffer.getChannelData(c);
    newChannelData.set(channelData.subarray(startSample, endSample));
  }

  return newBuffer;
}

export function normalizeAudioBuffer(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  targetDbFS: number = -1.0
): AudioBuffer {
  let peak = 0;
  const numChannels = buffer.numberOfChannels;

  // Find peak across all channels
  for (let c = 0; c < numChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }

  if (peak === 0) return buffer;

  const targetLinear = Math.pow(10, targetDbFS / 20);
  const gain = targetLinear / peak;

  const newBuffer = ctx.createBuffer(
    numChannels,
    buffer.length,
    buffer.sampleRate
  );

  for (let c = 0; c < numChannels; c++) {
    const srcData = buffer.getChannelData(c);
    const dstData = newBuffer.getChannelData(c);
    for (let i = 0; i < srcData.length; i++) {
      dstData[i] = Math.max(-1, Math.min(1, srcData[i] * gain));
    }
  }

  return newBuffer;
}

export function applyFade(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  fadeInSec: number,
  fadeOutSec: number
): AudioBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const totalLength = buffer.length;

  const fadeInSamples = Math.floor(fadeInSec * sampleRate);
  const fadeOutSamples = Math.floor(fadeOutSec * sampleRate);

  const newBuffer = ctx.createBuffer(numChannels, totalLength, sampleRate);

  for (let c = 0; c < numChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = newBuffer.getChannelData(c);
    dst.set(src);

    // Apply Fade In
    for (let i = 0; i < Math.min(fadeInSamples, totalLength); i++) {
      const factor = i / fadeInSamples; // Linear ramp
      dst[i] = dst[i] * factor;
    }

    // Apply Fade Out
    for (let i = 0; i < Math.min(fadeOutSamples, totalLength); i++) {
      const sampleIdx = totalLength - 1 - i;
      const factor = i / fadeOutSamples; // Linear ramp down
      dst[sampleIdx] = dst[sampleIdx] * factor;
    }
  }

  return newBuffer;
}

export function reverseAudioBuffer(
  ctx: BaseAudioContext,
  buffer: AudioBuffer
): AudioBuffer {
  const numChannels = buffer.numberOfChannels;
  const newBuffer = ctx.createBuffer(numChannels, buffer.length, buffer.sampleRate);

  for (let c = 0; c < numChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = newBuffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) {
      dst[i] = src[buffer.length - 1 - i];
    }
  }

  return newBuffer;
}

export function removeSilence(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  thresholdDb: number = -45,
  minSilenceDurationSec: number = 0.3
): AudioBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const thresholdLinear = Math.pow(10, thresholdDb / 20);
  const minSilenceSamples = Math.floor(minSilenceDurationSec * sampleRate);

  // Determine non-silent frames based on max channel amplitude
  const isSilentFrame = new Uint8Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    let maxAmp = 0;
    for (let c = 0; c < numChannels; c++) {
      const amp = Math.abs(buffer.getChannelData(c)[i]);
      if (amp > maxAmp) maxAmp = amp;
    }
    if (maxAmp < thresholdLinear) {
      isSilentFrame[i] = 1;
    }
  }

  // Filter out short silent segments
  const keepFrame = new Uint8Array(buffer.length);
  keepFrame.fill(1);

  let silenceStart = -1;
  for (let i = 0; i < buffer.length; i++) {
    if (isSilentFrame[i]) {
      if (silenceStart === -1) silenceStart = i;
    } else {
      if (silenceStart !== -1) {
        const silenceLength = i - silenceStart;
        if (silenceLength >= minSilenceSamples) {
          for (let s = silenceStart; s < i; s++) {
            keepFrame[s] = 0;
          }
        }
        silenceStart = -1;
      }
    }
  }

  // Count output frames
  let outputFrames = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (keepFrame[i]) outputFrames++;
  }

  if (outputFrames === 0) return buffer;

  const newBuffer = ctx.createBuffer(numChannels, outputFrames, sampleRate);
  for (let c = 0; c < numChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = newBuffer.getChannelData(c);
    let dstIdx = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (keepFrame[i]) {
        dst[dstIdx++] = src[i];
      }
    }
  }

  return newBuffer;
}

export function createAudioBufferFromPCM(
  ctx: BaseAudioContext,
  pcmData: Float32Array,
  sampleRate: number,
  numChannels: number = 1
): AudioBuffer {
  const frameCount = pcmData.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let c = 0; c < numChannels; c++) {
    const channelData = buffer.getChannelData(c);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = pcmData[i * numChannels + c];
    }
  }

  return buffer;
}
