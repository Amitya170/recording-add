/**
 * SessionStore — Analytics and Recording Session Duration Reporting Engine.
 * Logs podcast recording sessions to localStorage and generates real-time
 * technical metadata reports for the Admin Dashboard.
 */

export interface CueMarkerItem {
  id: string;
  time: number;
  label: string;
}

export interface RecordingSession {
  id: string;
  hostId: string;
  hostName: string;
  hostEmail: string;
  guestName: string;
  title: string;
  durationSeconds: number;
  createdAt: string;
  channelCount: number;
  format: string;

  // Rich Technical Metadata
  sampleRate?: number; // e.g. 44100 Hz
  bitDepth?: number; // e.g. 32-bit Float
  bitrateKbps?: number; // e.g. 2822 kbps
  fileSizeMb?: number; // e.g. 15.4 MB
  peakLeftDb?: number; // e.g. -1.2 dBFS
  peakRightDb?: number; // e.g. -2.4 dBFS
  integratedLufs?: number; // e.g. -16.5 LUFS
  audioCodec?: string; // e.g. "IEEE Float 32-Bit WAV"
  recordingDeviceA?: string; // Microphone A hardware name
  recordingDeviceB?: string; // Microphone B hardware name
  cueMarkers?: CueMarkerItem[];
}

export interface UserDurationReport {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  totalSessions: number;
  totalDurationSeconds: number;
  lastSessionDate: string | null;
}

export interface AnalyticsSummary {
  totalUsers: number;
  totalSessions: number;
  totalDurationSeconds: number;
  avgDurationSeconds: number;
}

const SESSIONS_KEY = 'podcast_studio_sessions_log';

export function getStoredSessions(): RecordingSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecordingSession(session: Omit<RecordingSession, 'id' | 'createdAt'>): RecordingSession {
  const sessions = getStoredSessions();

  // Calculate default metadata fields if missing
  const sampleRate = session.sampleRate || 44100;
  const bitDepth = session.bitDepth || 32;
  const channels = session.channelCount || 2;
  const bitrateKbps = session.bitrateKbps || Math.round((sampleRate * bitDepth * channels) / 1000);
  const fileSizeMb = session.fileSizeMb || Number(((session.durationSeconds * sampleRate * channels * (bitDepth / 8)) / (1024 * 1024)).toFixed(2));

  const newSession: RecordingSession = {
    ...session,
    sampleRate,
    bitDepth,
    bitrateKbps,
    fileSizeMb,
    audioCodec: session.audioCodec || 'PCM IEEE Float 32-bit WAV',
    id: 'sess_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    createdAt: new Date().toISOString(),
  };

  sessions.unshift(newSession);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  return newSession;
}

export function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || isNaN(totalSeconds)) return '00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function getAnalyticsSummary(allUsersCount: number): AnalyticsSummary {
  const sessions = getStoredSessions();
  const totalSessions = sessions.length;
  const totalDurationSeconds = sessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
  const avgDurationSeconds = totalSessions > 0 ? totalDurationSeconds / totalSessions : 0;

  return {
    totalUsers: allUsersCount,
    totalSessions,
    totalDurationSeconds,
    avgDurationSeconds,
  };
}

export function getUserDurationReports(allUsers: any[]): UserDurationReport[] {
  const sessions = getStoredSessions();

  return allUsers.map((user) => {
    const userSessions = sessions.filter(
      (s) => s.hostId === user.id || s.hostEmail?.toLowerCase() === user.email?.toLowerCase()
    );
    const totalDurationSeconds = userSessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
    const lastSession = userSessions[0];

    return {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      role: user.role || 'host',
      totalSessions: userSessions.length,
      totalDurationSeconds,
      lastSessionDate: lastSession ? lastSession.createdAt : null,
    };
  });
}

/**
 * Generate full metadata JSON bundle for export
 */
export function generateFullMetadataJSON(session: RecordingSession): string {
  const fullMeta = {
    metadataVersion: '2.0.0-PRO_AUDIO',
    sessionInformation: {
      sessionId: session.id,
      sessionTitle: session.title,
      dateRecordedISO: session.createdAt,
      dateRecordedFormatted: new Date(session.createdAt).toLocaleString(),
    },
    participantIdentity: {
      hostSpeaker: {
        id: session.hostId,
        name: session.hostName,
        email: session.hostEmail,
        role: 'Host / Moderator',
        assignedChannel: 'Channel 1 (Left)',
        hardwareInputDevice: session.recordingDeviceA || 'Default System Microphone A',
      },
      guestSpeaker: {
        name: session.guestName,
        role: 'Guest Contributor',
        assignedChannel: 'Channel 2 (Right)',
        hardwareInputDevice: session.recordingDeviceB || 'Default System Microphone B',
      },
    },
    audioTechnicalSpecifications: {
      durationSeconds: session.durationSeconds,
      durationFormatted: formatDuration(session.durationSeconds),
      totalSamples: session.durationSeconds * (session.sampleRate || 44100),
      sampleRateHz: session.sampleRate || 44100,
      bitDepthBits: session.bitDepth || 32,
      channelCount: session.channelCount || 2,
      channelConfiguration: session.channelCount === 2 ? 'Stereo Dual-Mono Isolation' : 'Mono Single Track',
      audioCodec: session.audioCodec || 'PCM IEEE Float 32-Bit WAV',
      bitrateKbps: session.bitrateKbps || 2822,
      estimatedFileSizeMB: session.fileSizeMb || 15.4,
    },
    dspLevelMetrics: {
      peakLeftChannelDBFS: session.peakLeftDb ?? -1.5,
      peakRightChannelDBFS: session.peakRightDb ?? -2.1,
      integratedLoudnessLUFS: session.integratedLufs ?? -16.2,
      dynamicRangeDb: 18.5,
      clippingDetected: (session.peakLeftDb ?? 0) >= 0 || (session.peakRightDb ?? 0) >= 0,
    },
    cuePoints: session.cueMarkers || [
      { id: '1', time: 0, label: 'Session Start / Intro' },
      { id: '2', time: session.durationSeconds / 2, label: 'Mid-roll / Topic Switch' },
    ],
    generatedBy: 'Podcast Craft Studio — Technical Metadata Engine v2.0',
    exportTimestamp: new Date().toISOString(),
  };

  return JSON.stringify(fullMeta, null, 2);
}

/**
 * Generate synthetic audio buffers matching session duration for Admin WAV Export
 */
export function createAudioBuffersForSession(session: RecordingSession): {
  audioBuffer: AudioBuffer;
  speakerABuffer: AudioBuffer;
  speakerBBuffer: AudioBuffer;
} {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx();
  const sampleRate = session.sampleRate || 44100;
  const duration = Math.max(1, session.durationSeconds || 5);
  const length = Math.floor(sampleRate * duration);

  const stereoBuf = ctx.createBuffer(2, length, sampleRate);
  const bufA = ctx.createBuffer(1, length, sampleRate);
  const bufB = ctx.createBuffer(1, length, sampleRate);

  const leftData = stereoBuf.getChannelData(0);
  const rightData = stereoBuf.getChannelData(1);
  const aData = bufA.getChannelData(0);
  const bData = bufB.getChannelData(0);

  const freqA = 220; // Host tone A3
  const freqB = 330; // Guest tone E4

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const hostSpeaking = Math.floor(t / 2.5) % 2 === 0;
    const guestSpeaking = Math.floor(t / 2.5) % 2 === 1;

    const sampleA = hostSpeaking ? 0.3 * Math.sin(2 * Math.PI * freqA * t) : 0;
    const sampleB = guestSpeaking ? 0.3 * Math.sin(2 * Math.PI * freqB * t) : 0;

    leftData[i] = sampleA;
    rightData[i] = sampleB;
    aData[i] = sampleA;
    bData[i] = sampleB;
  }

  return { audioBuffer: stereoBuf, speakerABuffer: bufA, speakerBBuffer: bufB };
}

/**
 * Generate combined metadata JSON bundle for ALL recorded sessions.
 */
export function generateCombinedMetadataJSON(
  sessions: RecordingSession[],
  allUsersCount: number
): string {
  const summary = getAnalyticsSummary(allUsersCount);

  const combinedPayload = {
    metadataVersion: '2.0.0-AGGREGATED_PRO_AUDIO',
    exportTimestamp: new Date().toISOString(),
    generatedBy: 'Podcast Craft Studio — Combined Technical Metadata Engine',
    systemSummary: {
      totalRegisteredUsers: summary.totalUsers,
      totalSessionsRecorded: summary.totalSessions,
      totalDurationSeconds: summary.totalDurationSeconds,
      totalDurationFormatted: formatDuration(summary.totalDurationSeconds),
      avgSessionDurationSeconds: Math.round(summary.avgDurationSeconds),
      avgSessionDurationFormatted: formatDuration(summary.avgDurationSeconds),
    },
    sessionsCount: sessions.length,
    sessions: sessions.map((session) => JSON.parse(generateFullMetadataJSON(session))),
  };

  return JSON.stringify(combinedPayload, null, 2);
}

/**
 * Generate combined human-readable plain text audit report for ALL sessions.
 */
export function generateCombinedMetadataTXT(
  sessions: RecordingSession[],
  allUsersCount: number
): string {
  const summary = getAnalyticsSummary(allUsersCount);

  let report = `===========================================================
PODCAST CRAFT STUDIO — COMBINED SYSTEM & SESSION METADATA REPORT
===========================================================
Export Timestamp: ${new Date().toLocaleString()}
Generated by:     Podcast Craft Studio Aggregated Analytics Engine

SYSTEM SUMMARY:
- Registered Users:      ${summary.totalUsers}
- Recorded Sessions:     ${summary.totalSessions}
- Cumulative Recording:  ${formatDuration(summary.totalDurationSeconds)} (${summary.totalDurationSeconds}s)
- Average Session Length:${formatDuration(summary.avgDurationSeconds)} (${Math.round(summary.avgDurationSeconds)}s)

===========================================================
RECORDED SESSIONS BREAKDOWN (${sessions.length} SESSIONS)
===========================================================
`;

  if (sessions.length === 0) {
    report += '\nNo recorded sessions found in the system log.\n';
  } else {
    sessions.forEach((s, index) => {
      report += `
[SESSION #${index + 1}] ${s.title}
- Session ID:       ${s.id}
- Recorded Date:    ${new Date(s.createdAt).toLocaleString()}
- Host Speaker:     ${s.hostName} (${s.hostEmail})
- Guest Speaker:    ${s.guestName}
- Duration:         ${formatDuration(s.durationSeconds)} (${s.durationSeconds}s)
- Sample Rate:      ${s.sampleRate || 44100} Hz | Bit Depth: ${s.bitDepth || 32}-bit Float
- Channels:         ${s.channelCount} Channels (Stereo L+R)
- Codec & Bitrate:  ${s.audioCodec || 'PCM WAV'} @ ${s.bitrateKbps || 2822} kbps
- File Size:        ${s.fileSizeMb || 15.4} MB
- Audio Levels:     Peak L: ${s.peakLeftDb ?? -1.5} dBFS | Peak R: ${s.peakRightDb ?? -2.1} dBFS | LUFS: ${s.integratedLufs ?? -16.2} LUFS
- Cue Markers (${(s.cueMarkers || []).length}):
${(s.cueMarkers || []).map((m) => `    * [${m.time}s] ${m.label}`).join('\n') || '    * None'}
-----------------------------------------------------------`;
    });
  }

  report += '\n\n===========================================================\nEND OF COMBINED METADATA REPORT\n===========================================================';
  return report;
}


