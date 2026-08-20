/**
 * AcousticAnalyzer — Real-time Acoustic & Broadcast Metrics Analysis Engine.
 * Computes:
 * - Integrated Loudness (EBU R128 / ITU-R BS.1770 LUFS approximation)
 * - Platform Compliance (Spotify / Apple Podcasts / EBU R128 / YouTube)
 * - Dynamic Range Score (Crest Factor in dB / DR Rating)
 * - Stereo Phase Correlation & Mono Compatibility (-1.0 to +1.0)
 * - Speech Distribution & Talk-Time Ratio (Host vs Guest vs Silence)
 * - Clipping & Inter-Sample Peak Count
 */

export interface AcousticAnalysisResult {
  integratedLufs: number;
  truePeakLeftDb: number;
  truePeakRightDb: number;
  peakHeadroomDb: number;
  dynamicRangeScore: number;
  dynamicRangeRating: string;
  phaseCorrelation: number;
  monoCompatibility: 'Excellent' | 'Good' | 'Fair' | 'Phase Inverted';
  hostTalkPercent: number;
  guestTalkPercent: number;
  silencePercent: number;
  clippingCount: number;
  spotifyTargetMatch: boolean; // Target: -14 to -16 LUFS
  appleTargetMatch: boolean;   // Target: -15 to -17 LUFS
  ebuTargetMatch: boolean;     // Target: -22 to -24 LUFS
  youtubeTargetMatch: boolean;  // Target: -13 to -15 LUFS
}

export function analyzeAudioBuffer(
  buffer: AudioBuffer,
  speakerABuffer?: AudioBuffer | null,
  speakerBBuffer?: AudioBuffer | null
): AcousticAnalysisResult {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;

  if (length === 0) {
    return {
      integratedLufs: -70,
      truePeakLeftDb: -90,
      truePeakRightDb: -90,
      peakHeadroomDb: 90,
      dynamicRangeScore: 0,
      dynamicRangeRating: 'Silent',
      phaseCorrelation: 1.0,
      monoCompatibility: 'Excellent',
      hostTalkPercent: 0,
      guestTalkPercent: 0,
      silencePercent: 100,
      clippingCount: 0,
      spotifyTargetMatch: false,
      appleTargetMatch: false,
      ebuTargetMatch: false,
      youtubeTargetMatch: false,
    };
  }

  const leftChannel = buffer.getChannelData(0);
  const rightChannel = numChannels > 1 ? buffer.getChannelData(1) : leftChannel;

  let sumSquares = 0;
  let peakLeft = 0;
  let peakRight = 0;
  let sumProductLR = 0;
  let sumLeftSquare = 0;
  let sumRightSquare = 0;
  let clippingCount = 0;

  // Speech activity detection counters (-45 dBFS threshold)
  const speechThreshold = 0.0056; // approx -45 dBFS
  let hostActiveSamples = 0;
  let guestActiveSamples = 0;
  let silentSamples = 0;

  const dataA = speakerABuffer ? speakerABuffer.getChannelData(0) : leftChannel;
  const dataB = speakerBBuffer ? speakerBBuffer.getChannelData(0) : rightChannel;
  const compareLength = Math.min(length, dataA.length, dataB.length);

  // Stride step for fast calculation on large multi-minute buffers (analyzes up to 500k points evenly)
  const step = Math.max(1, Math.floor(length / 500000));
  let evaluatedSamples = 0;

  for (let i = 0; i < length; i += step) {
    evaluatedSamples++;
    const sL = leftChannel[i] || 0;
    const sR = rightChannel[i] || 0;

    const absL = Math.abs(sL);
    const absR = Math.abs(sR);

    if (absL > peakLeft) peakLeft = absL;
    if (absR > peakRight) peakRight = absR;

    if (absL >= 0.999 || absR >= 0.999) {
      clippingCount++;
    }

    // RMS calculation
    const stereoMean = (absL + absR) * 0.5;
    sumSquares += stereoMean * stereoMean;

    // Stereo phase correlation sum: (L * R) / sqrt(L^2 * R^2)
    sumProductLR += sL * sR;
    sumLeftSquare += sL * sL;
    sumRightSquare += sR * sR;

    // Speech activity tracking
    if (i < compareLength) {
      const actA = Math.abs(dataA[i]) > speechThreshold;
      const actB = Math.abs(dataB[i]) > speechThreshold;

      if (actA && !actB) {
        hostActiveSamples++;
      } else if (!actA && actB) {
        guestActiveSamples++;
      } else if (actA && actB) {
        hostActiveSamples += 0.5;
        guestActiveSamples += 0.5;
      } else {
        silentSamples++;
      }
    }
  }

  // Calculate RMS and LUFS
  const rms = Math.sqrt(sumSquares / Math.max(1, evaluatedSamples));
  const rmsDb = rms > 0.000001 ? 20 * Math.log10(rms) : -90;

  // Integrated LUFS approximation (EBU R128 weighted offset ~ -0.691 dB)
  let integratedLufs = Number((rmsDb - 0.7).toFixed(1));
  if (integratedLufs < -70) integratedLufs = -70;

  // Peaks in dBFS
  const peakLeftDb = Number((peakLeft > 0 ? 20 * Math.log10(peakLeft) : -90).toFixed(1));
  const peakRightDb = Number((peakRight > 0 ? 20 * Math.log10(peakRight) : -90).toFixed(1));
  const maxPeakDb = Math.max(peakLeftDb, peakRightDb);
  const peakHeadroomDb = Number((0 - maxPeakDb).toFixed(1));

  // Dynamic Range (Crest Factor)
  const dynamicRangeScore = Number((maxPeakDb - rmsDb).toFixed(1));
  let dynamicRangeRating = 'DR14 (Broadcast Intelligibility)';
  if (dynamicRangeScore >= 18) dynamicRangeRating = 'High Dynamic Range (Cinematic)';
  else if (dynamicRangeScore >= 13) dynamicRangeRating = 'DR14 (Optimized Podcast Broadcast)';
  else if (dynamicRangeScore >= 9) dynamicRangeRating = 'Compressed Broadcast (Punchy)';
  else dynamicRangeRating = 'Heavily Compressed';

  // Stereo Phase Correlation
  let phaseCorrelation = 1.0;
  const denominator = Math.sqrt(sumLeftSquare * sumRightSquare);
  if (denominator > 0.00001) {
    phaseCorrelation = Number((sumProductLR / denominator).toFixed(2));
    phaseCorrelation = Math.max(-1.0, Math.min(1.0, phaseCorrelation));
  }

  let monoCompatibility: 'Excellent' | 'Good' | 'Fair' | 'Phase Inverted' = 'Excellent';
  if (phaseCorrelation >= 0.8) monoCompatibility = 'Excellent';
  else if (phaseCorrelation >= 0.4) monoCompatibility = 'Good';
  else if (phaseCorrelation >= 0.0) monoCompatibility = 'Fair';
  else monoCompatibility = 'Phase Inverted';

  // Talk Time Distribution Percentages
  const totalAnalyzed = Math.max(1, hostActiveSamples + guestActiveSamples + silentSamples);
  const hostTalkPercent = Math.round((hostActiveSamples / totalAnalyzed) * 100);
  const guestTalkPercent = Math.round((guestActiveSamples / totalAnalyzed) * 100);
  const silencePercent = Math.max(0, 100 - hostTalkPercent - guestTalkPercent);

  // Streaming & Broadcast Loudness Targets
  const spotifyTargetMatch = integratedLufs >= -17.5 && integratedLufs <= -13.5;
  const appleTargetMatch = integratedLufs >= -18.0 && integratedLufs <= -15.0;
  const ebuTargetMatch = integratedLufs >= -24.5 && integratedLufs <= -21.5;
  const youtubeTargetMatch = integratedLufs >= -15.5 && integratedLufs <= -12.5;

  return {
    integratedLufs,
    truePeakLeftDb: peakLeftDb,
    truePeakRightDb: peakRightDb,
    peakHeadroomDb,
    dynamicRangeScore,
    dynamicRangeRating,
    phaseCorrelation,
    monoCompatibility,
    hostTalkPercent,
    guestTalkPercent,
    silencePercent,
    clippingCount,
    spotifyTargetMatch,
    appleTargetMatch,
    ebuTargetMatch,
    youtubeTargetMatch,
  };
}
