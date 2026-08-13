/**
 * Pure TypeScript WAV Audio Encoder
 * Encodes AudioBuffer into 16-bit PCM, 24-bit PCM, or 32-bit Float WAV format.
 */

export type BitDepth = 16 | 24 | 32;

export interface WavEncoderOptions {
  sampleRate: number;
  numChannels: number;
  bitDepth: BitDepth;
}

export function encodeWav(audioBuffer: AudioBuffer, bitDepth: BitDepth = 16): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  /* RIFF chunk descriptor */
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  /* fmt sub-chunk */
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  const audioFormat = bitDepth === 32 ? 3 : 1; // 1 = PCM, 3 = IEEE Float
  view.setUint16(20, audioFormat, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  /* data sub-chunk */
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channels & write samples
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));

      if (bitDepth === 16) {
        // 16-bit PCM (-32768 to 32767)
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, intSample, true);
        offset += 2;
      } else if (bitDepth === 24) {
        // 24-bit PCM (-8388608 to 8388607)
        const intSample = sample < 0 ? sample * 0x800000 : sample * 0x7FFFFF;
        const val = Math.floor(intSample);
        view.setUint8(offset, val & 0xFF);
        view.setUint8(offset + 1, (val >> 8) & 0xFF);
        view.setUint8(offset + 2, (val >> 16) & 0xFF);
        offset += 3;
      } else if (bitDepth === 32) {
        // 32-bit Float
        view.setFloat32(offset, sample, true);
        offset += 4;
      }
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
