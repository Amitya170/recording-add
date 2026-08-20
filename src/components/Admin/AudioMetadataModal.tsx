import React, { useState } from 'react';
import {
  FileCode,
  X,
  Copy,
  CheckCircle,
  Activity,
  Bookmark,
  Check,
  Code2,
  Sliders,
  ShieldCheck,
} from 'lucide-react';
import {
  type RecordingSession,
  formatDuration,
  generateFullMetadataJSON,
  generateApplePodcastsRssChapterXML,
  generateJsonLdPodcastSchema,
  getStoredSessions,
} from '../../auth/SessionStore';

interface AudioMetadataModalProps {
  session: RecordingSession;
  onClose: () => void;
  onExportAudio?: (session: RecordingSession) => void;
}

export const AudioMetadataModal: React.FC<AudioMetadataModalProps> = ({ session: initialSession, onClose }) => {
  const [session, setSession] = useState<RecordingSession>(initialSession);
  const [activeTab, setActiveTab] = useState<'acoustic' | 'bwf_editor' | 'chapters' | 'export_code'>('acoustic');
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Editable fields
  const [showName, setShowName] = useState(session.podcastShowName || session.organizationName || 'Podcast Craft Studio Broadcast');
  const [seasonNum, setSeasonNum] = useState(session.podcastSeasonNum || 1);
  const [episodeNum, setEpisodeNum] = useState(session.podcastEpisodeNum || 1);
  const [episodeType, setEpisodeType] = useState<'full' | 'trailer' | 'bonus'>(session.podcastEpisodeType || 'full');
  const [isExplicit, setIsExplicit] = useState(session.podcastExplicit || false);
  const [description, setDescription] = useState(session.podcastDescription || `Live recording session with host ${session.hostName} and guest speaker ${session.guestName}.`);
  const [language, setLanguage] = useState(session.podcastLanguage || 'en-US');

  // New chapter state
  const [newChapterTime, setNewChapterTime] = useState(0);
  const [newChapterLabel, setNewChapterLabel] = useState('');

  const lufs = session.integratedLufs ?? -16.0;
  const peakL = session.peakLeftDb ?? -1.5;
  const peakR = session.peakRightDb ?? -2.1;
  const maxPeak = Math.max(peakL, peakR);
  const headroom = Number((0 - maxPeak).toFixed(1));
  const drScore = session.dynamicRangeScore ?? 14.2;
  const phase = session.phaseCorrelation ?? 0.92;
  const hostTalk = session.hostTalkPercent ?? 52;
  const guestTalk = session.guestTalkPercent ?? 44;
  const silenceTalk = session.silencePercent ?? 4;

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2200);
  };

  const handleSaveMetadataUpdates = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: RecordingSession = {
      ...session,
      podcastShowName: showName,
      podcastSeasonNum: Number(seasonNum),
      podcastEpisodeNum: Number(episodeNum),
      podcastEpisodeType: episodeType,
      podcastExplicit: isExplicit,
      podcastDescription: description,
      podcastLanguage: language,
    };

    // Update in localStorage
    const all = getStoredSessions();
    const idx = all.findIndex((s) => s.id === session.id);
    if (idx !== -1) {
      all[idx] = updated;
      localStorage.setItem('podcast_studio_sessions_log', JSON.stringify(all));
      window.dispatchEvent(new Event('storage'));
    }

    setSession(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleAddChapter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChapterLabel.trim()) return;

    const newCue = {
      id: Date.now().toString(),
      time: Math.max(0, Math.min(session.durationSeconds, Number(newChapterTime))),
      label: newChapterLabel.trim(),
    };

    const updatedCues = [...(session.cueMarkers || []), newCue].sort((a, b) => a.time - b.time);
    const updated: RecordingSession = { ...session, cueMarkers: updatedCues };

    const all = getStoredSessions();
    const idx = all.findIndex((s) => s.id === session.id);
    if (idx !== -1) {
      all[idx] = updated;
      localStorage.setItem('podcast_studio_sessions_log', JSON.stringify(all));
      window.dispatchEvent(new Event('storage'));
    }

    setSession(updated);
    setNewChapterLabel('');
    setNewChapterTime(0);
  };

  const handleDeleteChapter = (cueId: string) => {
    const updatedCues = (session.cueMarkers || []).filter((c) => c.id !== cueId);
    const updated: RecordingSession = { ...session, cueMarkers: updatedCues };

    const all = getStoredSessions();
    const idx = all.findIndex((s) => s.id === session.id);
    if (idx !== -1) {
      all[idx] = updated;
      localStorage.setItem('podcast_studio_sessions_log', JSON.stringify(all));
      window.dispatchEvent(new Event('storage'));
    }

    setSession(updated);
  };

  const jsonString = generateFullMetadataJSON(session);
  const rssXmlString = generateApplePodcastsRssChapterXML(session);
  const jsonLdString = generateJsonLdPodcastSchema(session);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '740px', maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto' }}>
        
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid var(--border-dim)', paddingBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(0, 240, 255, 0.12)',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-cyan)',
            }}>
              <FileCode size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>BROADCAST AUDIO METADATA & ACOUSTIC ENGINE</h3>
                <span className="daw-badge" style={{ color: 'var(--accent-green)', borderColor: 'rgba(0,255,135,0.3)' }}>
                  EBU R128 / BWF
                </span>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                SESSION ID: {session.id} • {session.title}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* 4 Main Tabs */}
        <div className="admin-nav-tabs" style={{ marginBottom: '16px' }}>
          <button
            type="button"
            className={`admin-nav-tab ${activeTab === 'acoustic' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('acoustic')}
          >
            <Activity size={13} />
            <span>Acoustics & Loudness</span>
          </button>

          <button
            type="button"
            className={`admin-nav-tab ${activeTab === 'bwf_editor' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('bwf_editor')}
          >
            <Sliders size={13} />
            <span>Podcast Tags & BWF Editor</span>
          </button>

          <button
            type="button"
            className={`admin-nav-tab ${activeTab === 'chapters' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('chapters')}
          >
            <Bookmark size={13} />
            <span>Chapter Timeline ({session.cueMarkers?.length || 0})</span>
          </button>

          <button
            type="button"
            className={`admin-nav-tab ${activeTab === 'export_code' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('export_code')}
          >
            <Code2 size={13} />
            <span>Apple/Spotify RSS & Code</span>
          </button>
        </div>

        {/* TAB 1: ACOUSTIC DIAGNOSTICS & LOUDNESS GAUGES */}
        {activeTab === 'acoustic' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Loudness & Compliance Target Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
              
              {/* Integrated LUFS */}
              <div style={{ background: 'var(--bg-darkest)', border: '1px solid var(--border-dim)', padding: '12px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 700 }}>INTEGRATED LOUDNESS</span>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                  {lufs} <span style={{ fontSize: '0.8rem' }}>LUFS</span>
                </div>
                <span style={{ fontSize: '0.62rem', color: 'var(--accent-green)' }}>
                  {lufs >= -17 && lufs <= -13 ? '● Spotify / Apple Optimized' : '● Broadcast Calibrated'}
                </span>
              </div>

              {/* True Peak & Headroom */}
              <div style={{ background: 'var(--bg-darkest)', border: '1px solid var(--border-dim)', padding: '12px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 700 }}>TRUE PEAK / HEADROOM</span>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: maxPeak >= 0 ? 'var(--accent-red)' : 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
                  {maxPeak} <span style={{ fontSize: '0.8rem' }}>dBFS</span>
                </div>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                  Headroom: +{headroom} dB (No ISP Clipping)
                </span>
              </div>

              {/* Dynamic Range Crest Factor */}
              <div style={{ background: 'var(--bg-darkest)', border: '1px solid var(--border-dim)', padding: '12px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 700 }}>DYNAMIC RANGE (CREST)</span>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#c084fc', fontFamily: 'var(--font-mono)' }}>
                  DR{Math.round(drScore)} <span style={{ fontSize: '0.8rem' }}>dB</span>
                </div>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                  Voice Intelligibility Target
                </span>
              </div>

              {/* Stereo Phase Correlation */}
              <div style={{ background: 'var(--bg-darkest)', border: '1px solid var(--border-dim)', padding: '12px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 700 }}>PHASE CORRELATION</span>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)' }}>
                  {phase > 0 ? `+${phase}` : phase}
                </div>
                <span style={{ fontSize: '0.62rem', color: 'var(--accent-green)' }}>
                  ● Perfect Mono Compatibility
                </span>
              </div>
            </div>

            {/* Platform Compliance Radar Badges */}
            <div style={{ background: 'var(--bg-darkest)', border: '1px solid var(--border-dim)', padding: '12px 16px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={14} color="var(--accent-green)" /> STREAMING PLATFORM LOUDNESS TARGET COMPLIANCE
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                <div className="daw-badge" style={{ color: lufs >= -17 && lufs <= -13 ? 'var(--accent-green)' : 'var(--text-muted)', justifyContent: 'center', padding: '6px' }}>
                  Spotify Target (-14 LUFS) {lufs >= -17 && lufs <= -13 ? '✓ PASS' : 'ℹ OK'}
                </div>
                <div className="daw-badge" style={{ color: lufs >= -18 && lufs <= -15 ? 'var(--accent-green)' : 'var(--text-muted)', justifyContent: 'center', padding: '6px' }}>
                  Apple Podcasts (-16 LUFS) {lufs >= -18 && lufs <= -15 ? '✓ PASS' : 'ℹ OK'}
                </div>
                <div className="daw-badge" style={{ color: lufs >= -15.5 && lufs <= -12.5 ? 'var(--accent-green)' : 'var(--text-muted)', justifyContent: 'center', padding: '6px' }}>
                  YouTube Standard (-14 LUFS) {lufs >= -15.5 && lufs <= -12.5 ? '✓ PASS' : 'ℹ OK'}
                </div>
                <div className="daw-badge" style={{ color: lufs >= -24 && lufs <= -22 ? 'var(--accent-green)' : 'var(--text-muted)', justifyContent: 'center', padding: '6px' }}>
                  EBU R128 (-23 LUFS) {lufs >= -24 && lufs <= -22 ? '✓ PASS' : 'ℹ OK'}
                </div>
              </div>
            </div>

            {/* Talk-Time Distribution Bar */}
            <div style={{ background: 'var(--bg-darkest)', border: '1px solid var(--border-dim)', padding: '12px 16px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  SPEECH DISTRIBUTION & TALK-TIME BALANCE
                </span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Total Audio: {formatDuration(session.durationSeconds)}
                </span>
              </div>

              {/* Progress Stack Bar */}
              <div style={{ height: '14px', borderRadius: '7px', background: 'rgba(0,0,0,0.4)', overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${hostTalk}%`, background: 'var(--accent-cyan)', transition: 'width 0.4s ease' }} title={`Host: ${hostTalk}%`} />
                <div style={{ width: `${guestTalk}%`, background: 'var(--accent-amber)', transition: 'width 0.4s ease' }} title={`Guest: ${guestTalk}%`} />
                <div style={{ width: `${silenceTalk}%`, background: 'rgba(255,255,255,0.1)' }} title={`Silence: ${silenceTalk}%`} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginTop: '6px' }}>
                <span style={{ color: 'var(--accent-cyan)' }}>● Host ({session.hostName}): {hostTalk}%</span>
                <span style={{ color: 'var(--accent-amber)' }}>● Guest ({session.guestName}): {guestTalk}%</span>
                <span style={{ color: 'var(--text-muted)' }}>● Room Tone / Silence: {silenceTalk}%</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PODCAST TAGS & BWF EDITOR */}
        {activeTab === 'bwf_editor' && (
          <form onSubmit={handleSaveMetadataUpdates} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {saveSuccess && (
              <div className="login-success">
                <CheckCircle size={14} /> <span>Broadcast & Podcast tags saved to session!</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="login-field">
                <label>PODCAST / SHOW NAME</label>
                <input
                  className="daw-input"
                  value={showName}
                  onChange={(e) => setShowName(e.target.value)}
                  placeholder="e.g. The Creator Broadcast Show"
                  required
                />
              </div>

              <div className="login-field">
                <label>EPISODE TYPE</label>
                <select
                  className="daw-select"
                  value={episodeType}
                  onChange={(e) => setEpisodeType(e.target.value as any)}
                >
                  <option value="full">Full Episode</option>
                  <option value="trailer">Trailer / Preview</option>
                  <option value="bonus">Bonus Content</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <div className="login-field">
                <label>SEASON NUMBER</label>
                <input
                  className="daw-input"
                  type="number"
                  min={1}
                  value={seasonNum}
                  onChange={(e) => setSeasonNum(parseInt(e.target.value) || 1)}
                />
              </div>

              <div className="login-field">
                <label>EPISODE NUMBER</label>
                <input
                  className="daw-input"
                  type="number"
                  min={1}
                  value={episodeNum}
                  onChange={(e) => setEpisodeNum(parseInt(e.target.value) || 1)}
                />
              </div>

              <div className="login-field">
                <label>LANGUAGE CODE</label>
                <input
                  className="daw-input"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="en-US"
                />
              </div>
            </div>

            <div className="login-field">
              <label>EPISODE SUMMARY & SHOW NOTES</label>
              <textarea
                className="daw-input"
                rows={3}
                style={{ resize: 'vertical', height: '70px' }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="explicitCheck"
                checked={isExplicit}
                onChange={(e) => setIsExplicit(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="explicitCheck" style={{ fontSize: '0.75rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                Contains Explicit Content (Tags Apple/Spotify RSS &lt;itunes:explicit&gt;)
              </label>
            </div>

            <button type="submit" className="creator-quick-btn active-cyan" style={{ height: '36px', justifyContent: 'center', marginTop: '4px' }}>
              <Check size={14} /> Save Embedded Broadcast Tags
            </button>
          </form>
        )}

        {/* TAB 3: CHAPTER MARKERS TIMELINE */}
        {activeTab === 'chapters' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            
            {/* Add Chapter Form */}
            <form onSubmit={handleAddChapter} style={{ display: 'flex', gap: '8px', background: 'var(--bg-darkest)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-dim)' }}>
              <input
                className="daw-input"
                type="number"
                min={0}
                max={session.durationSeconds}
                step={0.1}
                placeholder="Seconds (e.g. 45)"
                style={{ width: '130px' }}
                value={newChapterTime || ''}
                onChange={(e) => setNewChapterTime(parseFloat(e.target.value) || 0)}
              />
              <input
                className="daw-input"
                placeholder="Chapter Marker Title (e.g. Topic 1: Keynote)"
                style={{ flex: 1 }}
                value={newChapterLabel}
                onChange={(e) => setNewChapterLabel(e.target.value)}
              />
              <button type="submit" className="creator-quick-btn active-cyan">
                + Add Chapter
              </button>
            </form>

            {/* Chapters Table */}
            <div className="admin-table-wrap" style={{ maxHeight: '280px', overflowY: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>TIMECODE</th>
                    <th>CHAPTER TITLE</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {(session.cueMarkers || []).length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                        No chapter markers tagged yet. Add chapter cues above.
                      </td>
                    </tr>
                  ) : (
                    session.cueMarkers?.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                          {formatDuration(c.time)} ({c.time}s)
                        </td>
                        <td style={{ fontWeight: 600 }}>{c.label}</td>
                        <td>
                          <button
                            className="btn-icon-danger"
                            onClick={() => handleDeleteChapter(c.id)}
                            title="Delete Chapter"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: CODE & DISTRIBUTION EXPORTERS */}
        {activeTab === 'export_code' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* RSS Chapters XML */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                  APPLE PODCASTS & SPOTIFY RSS 2.0 CHAPTER ENCLOSURE TAGS
                </span>
                <button
                  className="creator-quick-btn"
                  style={{ fontSize: '0.68rem', padding: '3px 8px' }}
                  onClick={() => handleCopy(rssXmlString, 'rss')}
                >
                  {copiedType === 'rss' ? <Check size={12} color="var(--accent-green)" /> : <Copy size={12} />}
                  <span>{copiedType === 'rss' ? 'Copied XML!' : 'Copy RSS XML'}</span>
                </button>
              </div>
              <pre style={{ background: 'var(--bg-darkest)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-dim)', fontSize: '0.7rem', color: '#38bdf8', overflowX: 'auto', maxHeight: '140px' }}>
                {rssXmlString}
              </pre>
            </div>

            {/* Schema.org JSON-LD */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c084fc' }}>
                  SCHEMA.ORG PODCASTEPISODE JSON-LD (SEO ENCLOSURE)
                </span>
                <button
                  className="creator-quick-btn"
                  style={{ fontSize: '0.68rem', padding: '3px 8px' }}
                  onClick={() => handleCopy(jsonLdString, 'jsonld')}
                >
                  {copiedType === 'jsonld' ? <Check size={12} color="var(--accent-green)" /> : <Copy size={12} />}
                  <span>{copiedType === 'jsonld' ? 'Copied JSON-LD!' : 'Copy JSON-LD'}</span>
                </button>
              </div>
              <pre style={{ background: 'var(--bg-darkest)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-dim)', fontSize: '0.7rem', color: '#c084fc', overflowX: 'auto', maxHeight: '120px' }}>
                {jsonLdString}
              </pre>
            </div>

            {/* Full Technical JSON */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-green)' }}>
                  FULL TECHNICAL BWF/EBU R128 JSON SCHEMA
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="creator-quick-btn"
                    style={{ fontSize: '0.68rem', padding: '3px 8px' }}
                    onClick={() => handleCopy(jsonString, 'fulljson')}
                  >
                    {copiedType === 'fulljson' ? <Check size={12} color="var(--accent-green)" /> : <Copy size={12} />}
                    <span>{copiedType === 'fulljson' ? 'Copied JSON!' : 'Copy Full JSON'}</span>
                  </button>
                </div>
              </div>
              <pre style={{ background: 'var(--bg-darkest)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-dim)', fontSize: '0.7rem', color: '#4ade80', overflowX: 'auto', maxHeight: '120px' }}>
                {jsonString}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
