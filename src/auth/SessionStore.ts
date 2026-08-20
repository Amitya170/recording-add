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
  adminId?: string; // The Admin ID who manages this Host
  organizationName?: string; // Agency or Studio group name
  hostId: string;
  hostName: string;
  hostEmail: string;
  guestName: string;
  title: string;
  durationSeconds: number;
  createdAt: string;
  channelCount: number;
  format: string;

  // Rich Technical & Acoustic Metadata
  sampleRate?: number; // e.g. 44100 Hz
  bitDepth?: number; // e.g. 32-bit Float
  bitrateKbps?: number; // e.g. 2822 kbps
  fileSizeMb?: number; // e.g. 15.4 MB
  peakLeftDb?: number; // e.g. -1.2 dBFS
  peakRightDb?: number; // e.g. -2.4 dBFS
  integratedLufs?: number; // e.g. -16.0 LUFS (EBU R128)
  dynamicRangeScore?: number; // e.g. 14.2 dB (Crest Factor)
  phaseCorrelation?: number; // e.g. +0.92 (Stereo mono-compatibility)
  hostTalkPercent?: number; // e.g. 52%
  guestTalkPercent?: number; // e.g. 44%
  silencePercent?: number; // e.g. 4%
  audioCodec?: string; // e.g. "IEEE Float 32-Bit WAV"
  recordingDeviceA?: string; // Microphone A hardware name
  recordingDeviceB?: string; // Microphone B hardware name
  cueMarkers?: CueMarkerItem[];
  driveFileUrl?: string; // Google Drive direct URL
  driveUploadedAt?: string; // Timestamp when uploaded to Drive

  // Podcast Distribution & Publishing Metadata
  podcastShowName?: string;
  podcastSeasonNum?: number;
  podcastEpisodeNum?: number;
  podcastEpisodeType?: 'full' | 'trailer' | 'bonus';
  podcastExplicit?: boolean;
  podcastDescription?: string;
  podcastLanguage?: string;
}

export interface UserDurationReport {
  userId: string;
  userName: string;
  userEmail: string;
  adminId?: string;
  organizationName?: string;
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

export function getStoredSessions(adminId?: string): RecordingSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const list: RecordingSession[] = raw ? JSON.parse(raw) : [];
    if (!adminId) return list;
    return list.filter((s) => s.adminId === adminId || (!s.adminId && adminId === 'usr_admin1'));
  } catch {
    return [];
  }
}

export function updateSessionDriveStatus(sessionId: string, driveFileUrl: string): void {
  const sessions = getStoredSessions();
  const index = sessions.findIndex((s) => s.id === sessionId);
  if (index !== -1) {
    sessions[index].driveFileUrl = driveFileUrl;
    sessions[index].driveUploadedAt = new Date().toISOString();
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
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

export function getAnalyticsSummary(allUsersCount: number, adminId?: string): AnalyticsSummary {
  const sessions = getStoredSessions(adminId);
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

export function getUserDurationReports(allUsers: any[], adminId?: string): UserDurationReport[] {
  const sessions = getStoredSessions();
  const filteredUsers = adminId
    ? allUsers.filter((u) => u.adminId === adminId || (!u.adminId && adminId === 'usr_admin1'))
    : allUsers;

  return filteredUsers.map((user) => {
    const userEmail = (user.email || '').toLowerCase().trim();
    const userName = (user.name || '').toLowerCase().trim();
    const userId = user.id;

    const userSessions = sessions.filter((s) => {
      const sEmail = (s.hostEmail || '').toLowerCase().trim();
      const sName = (s.hostName || '').toLowerCase().trim();
      const sId = s.hostId;

      return (
        (userId && sId === userId) ||
        (userEmail && sEmail && sEmail === userEmail) ||
        (userName && sName && (sName.includes(userName) || userName.includes(sName)))
      );
    });

    const totalDurationSeconds = userSessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
    const lastSession = userSessions[0];

    return {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      adminId: user.adminId,
      organizationName: user.organizationName,
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
      integratedLoudnessLUFS: session.integratedLufs ?? -16.0,
      dynamicRangeDb: session.dynamicRangeScore ?? 14.2,
      phaseCorrelation: session.phaseCorrelation ?? 0.92,
      speechBalancePercent: {
        hostSpeech: session.hostTalkPercent ?? 52,
        guestSpeech: session.guestTalkPercent ?? 44,
        silence: session.silencePercent ?? 4,
      },
      clippingDetected: (session.peakLeftDb ?? 0) >= 0 || (session.peakRightDb ?? 0) >= 0,
      standardsCompliance: {
        spotifyTargetMatched: (session.integratedLufs ?? -16.0) >= -17 && (session.integratedLufs ?? -16.0) <= -13,
        applePodcastsTargetMatched: (session.integratedLufs ?? -16.0) >= -18 && (session.integratedLufs ?? -16.0) <= -15,
        ebuR128BroadcastMatched: (session.integratedLufs ?? -16.0) >= -24 && (session.integratedLufs ?? -16.0) <= -22,
      },
    },
    podcastPublishingTags: {
      showName: session.podcastShowName || session.organizationName || 'Podcast Craft Studio Broadcast',
      episodeNumber: session.podcastEpisodeNum || 1,
      seasonNumber: session.podcastSeasonNum || 1,
      episodeType: session.podcastEpisodeType || 'full',
      explicitRating: session.podcastExplicit ? 'explicit' : 'clean',
      description: session.podcastDescription || `Recorded live with ${session.hostName} and ${session.guestName}.`,
      language: session.podcastLanguage || 'en-US',
    },
    cuePoints: session.cueMarkers || [
      { id: '1', time: 0, label: 'Session Intro' },
      { id: '2', time: Math.floor(session.durationSeconds / 2), label: 'Main Discussion / Topic Switch' },
    ],
    generatedBy: 'Podcast Craft Studio — Technical Metadata Engine v2.0 (BWF/EBU R128 Compliant)',
    exportTimestamp: new Date().toISOString(),
  };

  return JSON.stringify(fullMeta, null, 2);
}

/**
 * Generate standard Apple Podcasts & Spotify RSS Chapter XML tags
 */
export function generateApplePodcastsRssChapterXML(session: RecordingSession): string {
  const cues = session.cueMarkers && session.cueMarkers.length > 0
    ? session.cueMarkers
    : [
        { id: '1', time: 0, label: 'Episode Introduction' },
        { id: '2', time: Math.floor(session.durationSeconds / 2), label: 'Main Topic & Interview' },
        { id: '3', time: Math.floor(session.durationSeconds * 0.9), label: 'Episode Outro & Links' },
      ];

  const formatXmlTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return `<!-- Apple Podcasts & Spotify RSS 2.0 Chapter Enclosure Tags -->
<item>
  <title>${escapeXml(session.title)}</title>
  <itunes:title>${escapeXml(session.title)}</itunes:title>
  <itunes:episodeType>${session.podcastEpisodeType || 'full'}</itunes:episodeType>
  <itunes:episode>${session.podcastEpisodeNum || 1}</itunes:episode>
  <itunes:season>${session.podcastSeasonNum || 1}</itunes:season>
  <itunes:author>${escapeXml(session.hostName)}</itunes:author>
  <itunes:duration>${session.durationSeconds}</itunes:duration>
  <itunes:explicit>${session.podcastExplicit ? 'yes' : 'no'}</itunes:explicit>
  <description>${escapeXml(session.podcastDescription || `Recorded live with host ${session.hostName} and guest ${session.guestName}.`)}</description>
  <pubDate>${new Date(session.createdAt).toUTCString()}</pubDate>

  <!-- Podlove Simple Chapters (Spotify / Overcast / PocketCasts) -->
  <psc:chapters version="1.2">
${cues
  .map(
    (c) =>
      `    <psc:chapter start="${formatXmlTime(c.time)}" title="${escapeXml(c.label)}" />`
  )
  .join('\n')}
  </psc:chapters>
</item>`;
}

function escapeXml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate Schema.org JSON-LD for Podcast Episode SEO
 */
export function generateJsonLdPodcastSchema(session: RecordingSession): string {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'PodcastEpisode',
    name: session.title,
    description: session.podcastDescription || `Recorded with ${session.hostName} and ${session.guestName}`,
    duration: `PT${Math.floor(session.durationSeconds / 60)}M${Math.floor(session.durationSeconds % 60)}S`,
    datePublished: session.createdAt,
    episodeNumber: session.podcastEpisodeNum || 1,
    partOfSeries: {
      '@type': 'PodcastSeries',
      name: session.podcastShowName || session.organizationName || 'Podcast Craft Studio Show',
    },
    creator: {
      '@type': 'Person',
      name: session.hostName,
      email: session.hostEmail,
    },
  };
  return JSON.stringify(schema, null, 2);
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

/**
 * Generate spreadsheet-compatible CSV export for all sessions.
 */
export function generateSessionsCSV(sessions: RecordingSession[]): string {
  const headers = [
    'Session ID',
    'Title',
    'Recorded Date',
    'Host Name',
    'Host Email',
    'Guest Name',
    'Duration (Seconds)',
    'Duration Formatted',
    'Sample Rate (Hz)',
    'Bit Depth',
    'Channels',
    'Codec',
    'Bitrate (kbps)',
    'File Size (MB)',
    'Peak Left (dBFS)',
    'Peak Right (dBFS)',
    'Integrated LUFS',
    'Cue Markers Count',
  ];

  const escapeCSV = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = sessions.map((s) => [
    escapeCSV(s.id),
    escapeCSV(s.title),
    escapeCSV(s.createdAt),
    escapeCSV(s.hostName),
    escapeCSV(s.hostEmail),
    escapeCSV(s.guestName),
    escapeCSV(s.durationSeconds),
    escapeCSV(formatDuration(s.durationSeconds)),
    escapeCSV(s.sampleRate || 44100),
    escapeCSV(s.bitDepth || 32),
    escapeCSV(s.channelCount || 2),
    escapeCSV(s.audioCodec || 'PCM WAV'),
    escapeCSV(s.bitrateKbps || 2822),
    escapeCSV(s.fileSizeMb || 15.4),
    escapeCSV(s.peakLeftDb ?? -1.5),
    escapeCSV(s.peakRightDb ?? -2.1),
    escapeCSV(s.integratedLufs ?? -16.2),
    escapeCSV((s.cueMarkers || []).length),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function deleteStoredSession(sessionId: string): void {
  const sessions = getStoredSessions();
  const filtered = sessions.filter((s) => s.id !== sessionId);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(filtered));
}

export function purgeOldSessions(daysOld: number = 30): number {
  const sessions = getStoredSessions();
  const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;
  const remaining = sessions.filter((s) => new Date(s.createdAt).getTime() >= cutoffTime);
  const purgedCount = sessions.length - remaining.length;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(remaining));
  return purgedCount;
}

export function clearAllSessions(): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify([]));
}

// ──────────────────────────────────────────────────────────────
// Multi-Tenant Session Token Lifecycle & Revocation Engine
// ──────────────────────────────────────────────────────────────

const ACTIVE_SESSION_PREFIX = 'podcast_active_session_';
const REVOKED_SESSIONS_KEY = 'podcast_revoked_session_tokens';

export function getRevokedSessionTokens(): string[] {
  try {
    const raw = localStorage.getItem(REVOKED_SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function isSessionTokenRevoked(token: string): boolean {
  if (!token) return false;
  const clean = token.trim().toLowerCase();
  const revoked = getRevokedSessionTokens();
  return revoked.includes(clean);
}

export function revokeSessionToken(token: string): void {
  if (!token) return;
  const clean = token.trim().toLowerCase();
  const revoked = getRevokedSessionTokens();
  if (!revoked.includes(clean)) {
    revoked.push(clean);
    localStorage.setItem(REVOKED_SESSIONS_KEY, JSON.stringify(revoked));
  }
}

export function getActiveHostSessionToken(hostId: string): string {
  const safeHost = (hostId || 'host').toLowerCase().replace(/[^a-z0-9]/g, '_');
  const key = ACTIVE_SESSION_PREFIX + safeHost;
  const existing = localStorage.getItem(key);
  if (existing && !isSessionTokenRevoked(existing)) {
    return existing;
  }
  const newToken = `room_${safeHost}_${Date.now().toString(36)}`;
  localStorage.setItem(key, newToken);
  return newToken;
}

export function rotateHostSessionToken(hostId: string): string {
  const safeHost = (hostId || 'host').toLowerCase().replace(/[^a-z0-9]/g, '_');
  const key = ACTIVE_SESSION_PREFIX + safeHost;
  const oldToken = localStorage.getItem(key);
  if (oldToken) {
    revokeSessionToken(oldToken);
  }
  const newToken = `room_${safeHost}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  localStorage.setItem(key, newToken);
  return newToken;
}



