/**
 * Pure TypeScript Broadcast Wave Format (BWF) WAV Audio Encoder
 * Encodes AudioBuffer into 16-bit PCM, 24-bit PCM, or 32-bit Float WAV format
 * with embedded BWF (bext), RIFF INFO (LIST), and Timeline Chapter Cue markers.
 */

export type BitDepth = 16 | 24 | 32;

export interface CueMarkerMetadata {
  time: number; // in seconds
  label: string;
}

export interface BwfMetadata {
  title?: string;
  artist?: string;
  organization?: string;
  description?: string;
  originator?: string;
  originatorRef?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:MM:SS
  loudnessLufs?: number;
  truePeakDb?: number;
  codingHistory?: string;
  cueMarkers?: CueMarkerMetadata[];
}

export interface WavEncoderOptions {
  sampleRate?: number;
  numChannels?: number;
  bitDepth?: BitDepth;
  metadata?: BwfMetadata;
}

export function encodeWav(
  audioBuffer: AudioBuffer,
  bitDepth: BitDepth = 16,
  metadata?: BwfMetadata
): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;

  // 1. Build BWF 'bext' chunk (Broadcast Wave Format)
  const bextChunk = buildBextChunk(metadata, sampleRate);

  // 2. Build RIFF 'INFO' chunk (LIST Chunk)
  const infoChunk = buildInfoChunk(metadata);

  // 3. Build RIFF 'cue ' and 'adtl' chunks (Timeline Chapter Markers)
  const cueChunks = buildCueAndAdtlChunks(metadata?.cueMarkers || [], sampleRate);

  // Total File Size = 12 (RIFF Header) + fmtChunk(24) + bextChunk + dataChunk(8 + dataSize) + infoChunk + cueChunks
  const headerSize = 12;
  const fmtChunkSize = 24; // 'fmt ' (4) + size (4) + fmt data (16)
  const dataHeaderSize = 8; // 'data' (4) + size (4)

  const totalFileSize =
    headerSize +
    fmtChunkSize +
    bextChunk.byteLength +
    dataHeaderSize +
    dataSize +
    infoChunk.byteLength +
    cueChunks.byteLength;

  const arrayBuffer = new ArrayBuffer(totalFileSize);
  const view = new DataView(arrayBuffer);
  let offset = 0;

  /* RIFF chunk descriptor */
  writeString(view, offset, 'RIFF');
  view.setUint32(offset + 4, totalFileSize - 8, true);
  writeString(view, offset + 8, 'WAVE');
  offset += 12;

  /* fmt sub-chunk */
  writeString(view, offset, 'fmt ');
  view.setUint32(offset + 4, 16, true); // Subchunk1Size (16 for PCM/IEEE Float)
  const audioFormat = bitDepth === 32 ? 3 : 1; // 1 = PCM, 3 = IEEE Float
  view.setUint16(offset + 8, audioFormat, true);
  view.setUint16(offset + 10, numChannels, true);
  view.setUint32(offset + 12, sampleRate, true);
  view.setUint32(offset + 16, sampleRate * blockAlign, true); // ByteRate
  view.setUint16(offset + 20, blockAlign, true);
  view.setUint16(offset + 22, bitDepth, true);
  offset += 24;

  /* bext sub-chunk (Broadcast Audio Extension) */
  if (bextChunk.byteLength > 0) {
    new Uint8Array(arrayBuffer, offset, bextChunk.byteLength).set(new Uint8Array(bextChunk));
    offset += bextChunk.byteLength;
  }

  /* data sub-chunk */
  writeString(view, offset, 'data');
  view.setUint32(offset + 4, dataSize, true);
  offset += 8;

  // Interleave channels & write samples
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }

  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i] || 0));

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

  /* LIST (INFO) sub-chunk */
  if (infoChunk.byteLength > 0) {
    new Uint8Array(arrayBuffer, offset, infoChunk.byteLength).set(new Uint8Array(infoChunk));
    offset += infoChunk.byteLength;
  }

  /* cue & adtl sub-chunks */
  if (cueChunks.byteLength > 0) {
    new Uint8Array(arrayBuffer, offset, cueChunks.byteLength).set(new Uint8Array(cueChunks));
    offset += cueChunks.byteLength;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Builds EBU Broadcast Wave Format (BWF 'bext') chunk
 */
function buildBextChunk(meta?: BwfMetadata, sampleRate: number = 44100): ArrayBuffer {
  if (!meta) return new ArrayBuffer(0);

  const description = (meta.description || meta.title || 'Podcast Studio Recording').padEnd(256, '\0').substring(0, 256);
  const originator = (meta.originator || meta.artist || 'Podcast Craft Studio').padEnd(32, '\0').substring(0, 32);
  const originatorRef = (meta.originatorRef || 'SESS_' + Date.now()).padEnd(32, '\0').substring(0, 32);

  const now = new Date();
  const dateStr = (meta.date || now.toISOString().split('T')[0]).replace(/-/g, ':').padEnd(10, '\0').substring(0, 10);
  const timeStr = (meta.time || now.toTimeString().split(' ')[0]).padEnd(8, '\0').substring(0, 8);

  const codingHistory = (meta.codingHistory || `A=PCM,F=${sampleRate},W=32,M=stereo,T=PodcastCraftStudio_2.0\r\n`).padEnd(64, '\0');

  const bextDataSize = 256 + 32 + 32 + 10 + 8 + 8 + 2 + 64 + 190 + codingHistory.length;
  const buffer = new ArrayBuffer(8 + bextDataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'bext');
  view.setUint32(4, bextDataSize, true);

  let offset = 8;
  writeString(view, offset, description); offset += 256;
  writeString(view, offset, originator); offset += 32;
  writeString(view, offset, originatorRef); offset += 32;
  writeString(view, offset, dateStr); offset += 10;
  writeString(view, offset, timeStr); offset += 8;

  // TimeReference (64-bit uint) = 0
  view.setUint32(offset, 0, true); offset += 4;
  view.setUint32(offset, 0, true); offset += 4;

  // Version 1
  view.setUint16(offset, 1, true); offset += 2;

  // UMID (64 bytes reserved)
  for (let i = 0; i < 64; i++) {
    view.setUint8(offset + i, 0);
  }
  offset += 64;

  // Loudness Value (in 0.01 LUFS)
  const lufsHundredths = Math.round((meta.loudnessLufs ?? -16.0) * 100);
  view.setInt16(offset, lufsHundredths, true); offset += 2;

  // Loudness Range (in 0.01 LU)
  view.setInt16(offset, 500, true); offset += 2;

  // Max True Peak Level (in 0.01 dBFS)
  const peakHundredths = Math.round((meta.truePeakDb ?? -1.0) * 100);
  view.setInt16(offset, peakHundredths, true); offset += 2;

  // Reserved (184 bytes)
  for (let i = 0; i < 184; i++) {
    view.setUint8(offset + i, 0);
  }
  offset += 184;

  // CodingHistory
  writeString(view, offset, codingHistory);

  return buffer;
}

/**
 * Builds RIFF 'INFO' LIST Chunk
 */
function buildInfoChunk(meta?: BwfMetadata): ArrayBuffer {
  if (!meta) return new ArrayBuffer(0);

  const tags: { id: string; val: string }[] = [];
  if (meta.title) tags.push({ id: 'INAM', val: meta.title });
  if (meta.artist) tags.push({ id: 'IART', val: meta.artist });
  if (meta.organization) tags.push({ id: 'IPRD', val: meta.organization });
  tags.push({ id: 'IGNR', val: 'Podcast / Broadcast Audio' });
  tags.push({ id: 'ICRD', val: new Date().getFullYear().toString() });
  if (meta.description) tags.push({ id: 'ICMT', val: meta.description });
  tags.push({ id: 'ISFT', val: 'Podcast Craft Studio 2.0 BWF Engine' });

  // Calculate size
  let listDataSize = 4; // 'INFO'
  const tagBuffers: { id: string; bytes: Uint8Array }[] = [];

  for (const t of tags) {
    const strBytes = new TextEncoder().encode(t.val + '\0');
    // Align to 2 bytes
    const paddedLength = strBytes.length + (strBytes.length % 2);
    const paddedBytes = new Uint8Array(paddedLength);
    paddedBytes.set(strBytes);
    tagBuffers.push({ id: t.id, bytes: paddedBytes });
    listDataSize += 8 + paddedLength;
  }

  const buffer = new ArrayBuffer(8 + listDataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'LIST');
  view.setUint32(4, listDataSize, true);
  writeString(view, 8, 'INFO');

  let offset = 12;
  for (const tb of tagBuffers) {
    writeString(view, offset, tb.id);
    view.setUint32(offset + 4, tb.bytes.length, true);
    new Uint8Array(buffer, offset + 8, tb.bytes.length).set(tb.bytes);
    offset += 8 + tb.bytes.length;
  }

  return buffer;
}

/**
 * Builds RIFF 'cue ' and 'LIST adtl' chunks for timeline chapter markers
 */
function buildCueAndAdtlChunks(cueMarkers: CueMarkerMetadata[], sampleRate: number): ArrayBuffer {
  if (!cueMarkers || cueMarkers.length === 0) return new ArrayBuffer(0);

  const numCues = cueMarkers.length;
  // cue chunk size = 4 (numCues) + numCues * 24
  const cueChunkSize = 4 + numCues * 24;

  // adtl chunk with 'labl' items
  let adtlSize = 4; // 'adtl'
  const lablBuffers: { cueId: number; labelBytes: Uint8Array }[] = [];

  for (let i = 0; i < numCues; i++) {
    const cue = cueMarkers[i];
    const str = new TextEncoder().encode((cue.label || `Chapter ${i + 1}`) + '\0');
    const paddedLength = str.length + (str.length % 2);
    const paddedBytes = new Uint8Array(paddedLength);
    paddedBytes.set(str);
    lablBuffers.push({ cueId: i + 1, labelBytes: paddedBytes });
    adtlSize += 8 + 4 + paddedLength; // 'labl' (4) + size (4) + cueId (4) + text
  }

  const totalSize = (8 + cueChunkSize) + (8 + adtlSize);
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  let offset = 0;

  /* 'cue ' chunk */
  writeString(view, offset, 'cue ');
  view.setUint32(offset + 4, cueChunkSize, true);
  view.setUint32(offset + 8, numCues, true);
  offset += 12;

  for (let i = 0; i < numCues; i++) {
    const cue = cueMarkers[i];
    const sampleOffset = Math.round((cue.time || 0) * sampleRate);
    const cueId = i + 1;

    view.setUint32(offset, cueId, true); // ID
    view.setUint32(offset + 4, sampleOffset, true); // Position
    writeString(view, offset + 8, 'data'); // Data chunk ID
    view.setUint32(offset + 12, 0, true); // Chunk Start
    view.setUint32(offset + 16, 0, true); // Block Start
    view.setUint32(offset + 20, sampleOffset, true); // Sample Offset
    offset += 24;
  }

  /* 'LIST adtl' chunk */
  writeString(view, offset, 'LIST');
  view.setUint32(offset + 4, adtlSize, true);
  writeString(view, offset + 8, 'adtl');
  offset += 12;

  for (const lb of lablBuffers) {
    const subSize = 4 + lb.labelBytes.length; // cueId + label
    writeString(view, offset, 'labl');
    view.setUint32(offset + 4, subSize, true);
    view.setUint32(offset + 8, lb.cueId, true);
    new Uint8Array(buffer, offset + 12, lb.labelBytes.length).set(lb.labelBytes);
    offset += 8 + subSize;
  }

  return buffer;
}
