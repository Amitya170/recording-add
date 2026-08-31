/**
 * WebRTCAudioEngine — Robust Cross-Device P2P Audio via PeerJS + STUN/TURN.
 *
 * Designed to connect Host and Guest across separate devices and different networks/routers.
 *
 * Key Architecture:
 * 1. Deterministic host ID based on session token: `pcs_host_<sessionToken>`
 * 2. Dynamic TURN credentials fetched from Metered.ca free API (20GB/month free relay)
 *    + Google/Cloudflare STUN fleet for direct connections.
 *    Set VITE_METERED_API_KEY in .env — without it, cross-network calls WILL fail.
 * 3. Dual channel:
 *    - DataConnection: Immediate handshake, keepalive & control signals.
 *    - MediaConnection: Full-duplex live microphone audio stream.
 * 4. Resilient Live Audio Fallback: Guarantees WebRTC SDP negotiation succeeds even before user grants mic,
 *    and seamlessly updates to live mic track via replaceTrack & renegotiation as soon as mic is active.
 * 5. TURN credential TTL refresh (re-fetches every 6 hours to prevent stale relay tokens).
 * 6. Proper ICE restart with full SDP renegotiation for cross-network recovery.
 * 7. Escalating reconnect: after 3 failed attempts, destroys and rebuilds the entire Peer with fresh credentials.
 */

import Peer, { type DataConnection, type MediaConnection } from 'peerjs';

export interface WebRTCStatus {
  connected: boolean;
  role: 'host' | 'guest';
  remoteStream: MediaStream | null;
  statusText: string;
}

function safePeerId(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 40);
}

/**
 * Creates an active silence audio stream if real microphone stream is not ready yet.
 * Resumes AudioContext to guarantee live RTP packet clocking across WebRTC peers.
 */
function getEnsuredAudioStream(stream: MediaStream | null): MediaStream {
  if (stream && stream.getAudioTracks().length > 0 && stream.getAudioTracks()[0].readyState === 'live') {
    return stream;
  }
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001; // tiny non-zero value so WebRTC audio encoder stays active
    const dest = ctx.createMediaStreamDestination();
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    return dest.stream;
  } catch {
    return stream ?? new MediaStream();
  }
}

// ──────────────────────────────────────────────────────────────
// STUN-only fallback (always available, no credentials needed)
// ──────────────────────────────────────────────────────────────
const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// ──────────────────────────────────────────────────────────────
// Dynamic TURN credential fetching via Metered.ca free API
// (20 GB free relay traffic per month — required for cross-network/city connections)
//
// Set these in your .env to enable TURN relay:
//   VITE_METERED_API_KEY=your_api_key_here
//   VITE_METERED_APP_NAME=your_app_name  (optional, defaults to 'recording')
//
// Steps:
//   1. Sign up free at https://dashboard.metered.ca/signup
//   2. Create an app, copy the API Key and App Name
//   3. Create .env in project root with the values above
// ──────────────────────────────────────────────────────────────

// [FIX 2] TURN credential cache with TTL — re-fetches when older than 6 hours
// to prevent stale relay tokens from silently killing cross-network connections.
let cachedIceServers: RTCIceServer[] | null = null;
let cachedIceTimestamp: number = 0;
const ICE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const DEFAULT_METERED_APP_NAME = 'amitya';
const DEFAULT_METERED_API_KEY = '0e01ebea1f2f07f3375ea87d3093ba05d791';

async function fetchIceServers(forceRefresh: boolean = false): Promise<RTCIceServer[]> {
  // Return cached result if still valid (within TTL)
  const now = Date.now();
  if (!forceRefresh && cachedIceServers && (now - cachedIceTimestamp) < ICE_CACHE_TTL_MS) {
    return cachedIceServers;
  }

  const apiKey = ((import.meta as any).env?.VITE_METERED_API_KEY as string | undefined) || DEFAULT_METERED_API_KEY;
  const appName = ((import.meta as any).env?.VITE_METERED_APP_NAME as string | undefined) || DEFAULT_METERED_APP_NAME;

  try {
    const resp = await fetch(
      `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const meteredServers: RTCIceServer[] = await resp.json();
    // Combine: STUN fleet + Metered TURN servers (UDP + TCP + TLS Port 443)
    cachedIceServers = [...STUN_SERVERS, ...meteredServers];
    cachedIceTimestamp = now;
    console.log('[WebRTC] Live TURN credentials successfully loaded from Metered.ca:', meteredServers.length, 'relay servers active');
    return cachedIceServers;
  } catch (e) {
    console.error('[WebRTC] Failed to fetch TURN credentials from Metered.ca:', e);
    // On failure, use stale cache if available, otherwise STUN-only
    if (cachedIceServers && cachedIceServers.length > STUN_SERVERS.length) {
      console.warn('[WebRTC] Using stale TURN credentials as fallback');
      return cachedIceServers;
    }
    cachedIceServers = STUN_SERVERS;
    cachedIceTimestamp = now;
    return cachedIceServers;
  }
}

export class WebRTCAudioEngine {
  private peer: Peer | null = null;
  private mediaConn: MediaConnection | null = null;
  private dataConn: DataConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private guestCallRetryInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private connectionWatchdog: ReturnType<typeof setTimeout> | null = null;
  private sessionToken: string;
  private isDisposed = false;
  private isConnecting = false;

  // Track IDs for local and remote streams (kept separate so they don't overwrite each other)
  private lastLocalTrackId: string | null = null;
  private lastRemoteTrackId: string | null = null;

  // [FIX 5] Escalating reconnect counter — after 3 consecutive failures,
  // destroys entire Peer and fetches fresh TURN credentials.
  private consecutiveFailures: number = 0;
  private static readonly MAX_FAILURES_BEFORE_REBUILD = 3;

  // [FIX 6] Serialized guest retry — prevents overlapping call attempts
  // that put PeerJS signaling into an inconsistent state.
  private guestRetryBackoffMs: number = 3000;
  private static readonly GUEST_RETRY_MIN_MS = 3000;
  private static readonly GUEST_RETRY_MAX_MS = 15000;

  public role: 'host' | 'guest';
  public isConnected: boolean = false;
  public onStatusChange?: (status: WebRTCStatus) => void;
  public onRemoteStream?: (stream: MediaStream) => void;
  public onSignal?: (message: any) => void;

  constructor(role: 'host' | 'guest', sessionToken: string = 'podcast_default_session') {
    this.role = role;
    this.sessionToken = safePeerId(sessionToken);
    this.initPeer();
  }

  // ──────────────────────────────────────────────────────────────
  // PeerJS initialisation
  // ──────────────────────────────────────────────────────────────

  private async initPeer(forceNewCredentials: boolean = false) {
    if (this.isDisposed) return;

    const peerId = this.role === 'host'
      ? `pcs_host_${this.sessionToken}`
      : undefined;

    this.updateStatus(this.role === 'host'
      ? 'Waiting for Guest to Join…'
      : 'Connecting to Host Studio Room…');

    // Fetch TURN credentials dynamically (TTL-cached, force refresh when rebuilding)
    const iceServers = await fetchIceServers(forceNewCredentials);

    // [FIX 3] Explicit PeerJS server configuration for reliable signaling.
    // The default PeerJS cloud server is used but with explicit parameters
    // and increased connection reliability settings.
    try {
      this.peer = new Peer(peerId as string, {
        host: '0.peerjs.com',
        port: 443,
        secure: true,
        path: '/',
        debug: 1,
        pingInterval: 5000, // WebSocket ping every 5s to keep signaling connection active indefinitely
        config: {
          iceServers,
          sdpSemantics: 'unified-plan',
          iceTransportPolicy: 'all',
          bundlePolicy: 'max-bundle',
          rtcpMuxPolicy: 'require',
        },
      });
    } catch (e) {
      console.error('[WebRTC] Peer creation error:', e);
      this.scheduleReconnect(4000);
      return;
    }

    this.peer.on('open', (id) => {
      console.log(`[WebRTC] ${this.role} online on signaling broker — peer ID: ${id}`);
      // Reset failure counter on successful signaling connection
      this.consecutiveFailures = 0;
      this.guestRetryBackoffMs = WebRTCAudioEngine.GUEST_RETRY_MIN_MS;
      if (this.role === 'host') {
        this.updateStatus('Studio Room Ready ✓ — Waiting for Guest to Join…');
        this.listenAsHost();
      } else {
        this.updateStatus('Connecting to Host Studio Room…');
        this.startGuestCallLoop();
      }
      this.startHeartbeat();
    });

    this.peer.on('error', (err) => {
      console.warn(`[WebRTC] ${this.role} peer error:`, err.type, err.message);
      switch (err.type) {
        case 'unavailable-id':
          if (this.role === 'host') {
            this.updateStatus('Session ID already in use — recovering…');
            this.scheduleReconnect(2500);
          }
          break;
        case 'peer-unavailable':
          // [FIX 6] Don't schedule a separate setTimeout retry here — the
          // serialized guest call loop already handles retries with backoff.
          // The old code had both a setTimeout(3000) here AND a setInterval(5000)
          // in startGuestCallLoop, causing overlapping call attempts.
          this.updateStatus('Waiting for Host to be online in studio… (Retrying)', false);
          this.isConnecting = false;
          this.consecutiveFailures++;
          this.checkEscalatingReconnect();
          break;
        case 'network':
        case 'disconnected':
        case 'server-error':
          this.updateStatus('Signaling reconnecting…');
          this.isConnecting = false;
          this.consecutiveFailures++;
          try { this.peer?.reconnect(); } catch {}
          this.checkEscalatingReconnect();
          break;
        default:
          this.updateStatus(`Connecting (${err.type})…`);
          this.isConnecting = false;
          this.consecutiveFailures++;
          this.checkEscalatingReconnect();
      }
    });

    this.peer.on('disconnected', () => {
      if (!this.isConnected && !this.isDisposed) {
        console.log(`[WebRTC] ${this.role} signaling disconnected — auto-reconnecting…`);
        this.updateStatus('Reconnecting to room signaling server…');
        try { this.peer?.reconnect(); } catch {}
        this.scheduleReconnect(3000);
      }
    });
  }

  // ──────────────────────────────────────────────────────────────
  // [FIX 5] Escalating Reconnect — Full Peer Rebuild After N Failures
  // When the signaling server silently drops the websocket or TURN
  // credentials have expired, simply retrying the same connection
  // never works. After 3 consecutive failures, destroy everything
  // and rebuild with freshly fetched TURN credentials.
  // ──────────────────────────────────────────────────────────────

  private checkEscalatingReconnect() {
    if (this.isDisposed || this.isConnected) return;
    if (this.consecutiveFailures >= WebRTCAudioEngine.MAX_FAILURES_BEFORE_REBUILD) {
      console.warn(`[WebRTC] ${this.role}: ${this.consecutiveFailures} consecutive failures — rebuilding peer with fresh TURN credentials`);
      this.consecutiveFailures = 0;
      this.guestRetryBackoffMs = WebRTCAudioEngine.GUEST_RETRY_MIN_MS;
      this.stopGuestCallLoop();
      if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = setTimeout(() => {
        if (this.isDisposed || this.isConnected) return;
        try { this.peer?.destroy(); } catch {}
        this.peer = null;
        this.initPeer(true); // forceNewCredentials = true
      }, 1500);
    } else {
      this.scheduleReconnect(Math.min(5000, 2000 + this.consecutiveFailures * 1000));
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Heartbeat & Keepalive to keep NAT pinholes open across WAN
  // ──────────────────────────────────────────────────────────────

  private startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      // 1. DataConnection Keepalive Ping
      if (this.dataConn && this.dataConn.open) {
        try {
          this.dataConn.send({ type: '__ping__', timestamp: Date.now() });
        } catch {}
      }
      // 2. Signaling socket keepalive — keep Peer visible on cloud
      if (this.peer && !this.isDisposed) {
        if (this.peer.disconnected && !this.peer.destroyed) {
          console.log(`[WebRTC] ${this.role} signaling socket disconnected — reconnecting…`);
          try { this.peer.reconnect(); } catch {}
        }
      }
    }, 3000);
  }

  // ──────────────────────────────────────────────────────────────
  // [FIX 4] ICE Restart with Full SDP Renegotiation
  // Calling restartIce() alone does nothing — it only sets a flag.
  // A new SDP offer with iceRestart:true must be created and applied
  // to actually allocate new TURN relay ports across networks.
  // ──────────────────────────────────────────────────────────────

  private async performIceRestart(pc: RTCPeerConnection, label: string) {
    try {
      console.log(`[WebRTC] ${label}: performing full ICE restart with SDP renegotiation`);
      // Step 1: Signal the ICE agent to gather new candidates
      if (typeof pc.restartIce === 'function') {
        pc.restartIce();
      }
      // Step 2: Create a new offer with iceRestart flag (allocates new TURN relay)
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      console.log(`[WebRTC] ${label}: ICE restart offer applied — waiting for new candidates`);
    } catch (e) {
      console.warn(`[WebRTC] ${label}: ICE restart SDP renegotiation failed:`, e);
      // Fall back to full peer rebuild
      this.handleDisconnect(`Connection interrupted — rebuilding…`);
      this.consecutiveFailures = WebRTCAudioEngine.MAX_FAILURES_BEFORE_REBUILD;
      this.checkEscalatingReconnect();
    }
  }

  // ──────────────────────────────────────────────────────────────
  // [FIX 7] Enhanced ICE Diagnostics — Log Selected Candidate Pair
  // Shows whether TURN relay is actually being used for cross-network
  // connections. Look for type=relay in console to confirm TURN is active.
  // ──────────────────────────────────────────────────────────────

  private attachIceDiagnostics(pc: RTCPeerConnection, label: string) {
    // Log every ICE candidate for NAT traversal diagnostics
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const c = event.candidate;
        const typeIcon = c.type === 'relay' ? '🔄 TURN' : c.type === 'srflx' ? '🌐 STUN' : '🏠 LOCAL';
        console.log(`[WebRTC] ${label} ICE candidate: ${typeIcon} type=${c.type} protocol=${c.protocol} address=${c.address}:${c.port}`);
      }
    };

    // Log ICE connection state transitions with candidate pair details
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[WebRTC] ${label} ICE state: ${state}`);

      if (state === 'connected' || state === 'completed') {
        this.consecutiveFailures = 0;
        this.updateStatus(
          this.role === 'host' ? 'Guest Connected ✓ (Audio Live)' : 'Connected to Host ✓ (Audio Live)',
          true
        );

        // Log the selected candidate pair to confirm relay vs direct
        try {
          pc.getStats().then((stats) => {
            stats.forEach((report) => {
              if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                const localId = report.localCandidateId;
                const remoteId = report.remoteCandidateId;
                let localType = '?', remoteType = '?';
                stats.forEach((r) => {
                  if (r.id === localId) localType = r.candidateType || '?';
                  if (r.id === remoteId) remoteType = r.candidateType || '?';
                });
                console.log(`[WebRTC] ${label} ✅ CONNECTED via: local=${localType} remote=${remoteType} (relay = TURN active)`);
              }
            });
          }).catch(() => {});
        } catch {}
      } else if (state === 'failed') {
        console.warn(`[WebRTC] ${label} ICE FAILED across networks — attempting ICE restart with renegotiation`);
        this.performIceRestart(pc, label);
      } else if (state === 'disconnected') {
        // ICE disconnected is often transient (e.g. network switch), wait a bit before acting
        console.warn(`[WebRTC] ${label} ICE disconnected — monitoring for recovery…`);
      }
    };

    // Track connection state for additional diagnostics
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] ${label} connection state: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        this.consecutiveFailures++;
        this.checkEscalatingReconnect();
      }
    };
  }

  // ──────────────────────────────────────────────────────────────
  // Remote Stream Handler (Deduplicated)
  // ──────────────────────────────────────────────────────────────

  private handleRemoteStream(stream: MediaStream, forceRefresh: boolean = false) {
    if (this.isDisposed) return;
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) return;

    // Deduplicate only when not forcing a refresh
    const newTrackId = tracks[0].id;
    if (!forceRefresh && this.lastRemoteTrackId === newTrackId && this.isConnected) return;
    this.lastRemoteTrackId = newTrackId;

    tracks.forEach((t) => {
      t.enabled = true;
      // When remote peer begins transmitting real audio over network, onunmute fires
      t.onunmute = () => {
        console.log(`[WebRTC] ${this.role}: remote audio track unmuted (live data flowing)`);
        this.onRemoteStream?.(stream);
      };
    });

    this.remoteStream = stream;
    this.isConnected = true;
    this.consecutiveFailures = 0; // Reset on successful stream
    console.log(`[WebRTC] ${this.role}: remote live audio stream attached (tracks: ${tracks.length}, forced: ${forceRefresh})`);

    const statusMsg = this.role === 'host'
      ? 'Guest Connected ✓ (Audio Live)'
      : 'Connected to Host ✓ (Audio Live)';
    this.updateStatus(statusMsg, true);
    this.onRemoteStream?.(stream);
  }

  // ──────────────────────────────────────────────────────────────
  // HOST — Listen for incoming guest connection & call
  // ──────────────────────────────────────────────────────────────

  private listenAsHost() {
    if (!this.peer) return;

    // Incoming DataConnection from guest
    this.peer.on('connection', (conn) => {
      console.log('[WebRTC] Host: guest data connection received from', conn.peer);
      try { this.dataConn?.close(); } catch {}
      this.dataConn = conn;

      conn.on('open', () => {
        console.log('[WebRTC] Host: data channel OPEN with guest');
        this.updateStatus('Guest Connected ✓ — P2P Live', true);
        // Send host track ready signal if host mic is active
        if (this.localStream) {
          conn.send({ type: '__TRACK_UPDATED__', timestamp: Date.now() });
        }
      });

      conn.on('data', (data: any) => {
        if (data?.type === '__ping__') return; // ignore internal keepalive
        if (data?.type === '__TRACK_UPDATED__') {
          console.log('[WebRTC] Host: guest updated audio track — refreshing playback & capture');
          if (this.remoteStream) {
            this.handleRemoteStream(this.remoteStream, true);
          }
          return;
        }
        this.onSignal?.(data);
      });

      conn.on('close', () => {
        console.log('[WebRTC] Host: data channel closed');
        this.handleDisconnect('Guest disconnected — waiting to reconnect…');
      });

      conn.on('error', (e) => console.warn('[WebRTC] Host data error:', e));
    });

    // Incoming MediaConnection (Audio Call) from guest
    this.peer.on('call', (call) => {
      console.log('[WebRTC] Host: incoming audio call from guest', call.peer);
      try { this.mediaConn?.close(); } catch {}
      this.mediaConn = call;

      const hostStream = getEnsuredAudioStream(this.localStream);
      call.answer(hostStream);
      this.updateStatus('Guest Connected ✓ — Audio Call Active', true);

      call.on('stream', (remoteStream) => {
        this.handleRemoteStream(remoteStream);
      });

      // [FIX 4 + FIX 7] Attach unified ICE diagnostics with proper restart
      const pc = (call as any).peerConnection as RTCPeerConnection;
      if (pc) {
        pc.ontrack = (event) => {
          const stream = event.streams[0] || new MediaStream([event.track]);
          this.handleRemoteStream(stream);
        };

        this.attachIceDiagnostics(pc, 'Host');
      }

      call.on('close', () => {
        console.log('[WebRTC] Host: guest audio call closed');
        this.handleDisconnect('Guest audio disconnected');
      });

      call.on('error', (e) => console.warn('[WebRTC] Host call error:', e));
    });
  }

  // ──────────────────────────────────────────────────────────────
  // GUEST — Connect and call Host with auto-retry
  // [FIX 6] Serialized call loop with exponential backoff.
  // Replaces the old overlapping setInterval(5000) + setTimeout(3000)
  // that caused PeerJS to enter an inconsistent state.
  // ──────────────────────────────────────────────────────────────

  private startGuestCallLoop() {
    this.stopGuestCallLoop();
    this.attemptGuestCall();

    // Serialized retry: uses current backoff interval, increases on each failure
    this.guestCallRetryInterval = setInterval(() => {
      if (!this.isConnected && !this.isDisposed && !this.isConnecting) {
        console.log(`[WebRTC] Guest: retrying P2P connection to Host… (backoff: ${this.guestRetryBackoffMs}ms)`);
        this.attemptGuestCall();
      } else if (this.isConnected) {
        this.stopGuestCallLoop();
      }
    }, this.guestRetryBackoffMs);
  }

  private stopGuestCallLoop() {
    if (this.guestCallRetryInterval) {
      clearInterval(this.guestCallRetryInterval);
      this.guestCallRetryInterval = null;
    }
    if (this.connectionWatchdog) {
      clearTimeout(this.connectionWatchdog);
      this.connectionWatchdog = null;
    }
  }

  /**
   * Increase backoff interval for guest retry loop (capped at MAX).
   */
  private increaseGuestBackoff() {
    this.guestRetryBackoffMs = Math.min(
      this.guestRetryBackoffMs * 1.5,
      WebRTCAudioEngine.GUEST_RETRY_MAX_MS
    );
  }

  public retryConnection() {
    console.log(`[WebRTC] Manual retry triggered for ${this.role}`);
    // Reset backoff on manual retry
    this.consecutiveFailures = 0;
    this.guestRetryBackoffMs = WebRTCAudioEngine.GUEST_RETRY_MIN_MS;
    if (this.role === 'guest') {
      this.isConnecting = false;
      this.lastLocalTrackId = null;
      this.lastRemoteTrackId = null;
      this.stopGuestCallLoop();
      this.attemptGuestCall();
    } else {
      this.scheduleReconnect(500);
    }
  }

  private attemptGuestCall() {
    // [FIX 6] Guard against overlapping calls — the old code allowed
    // multiple simultaneous call attempts which broke PeerJS state.
    if (!this.peer || this.peer.destroyed || this.isDisposed || this.isConnecting) return;
    this.isConnecting = true;

    const hostId = `pcs_host_${this.sessionToken}`;
    console.log('[WebRTC] Guest: connecting to host ID:', hostId);

    // Watchdog: If connection doesn't open within 8s (increased from 4.5s for
    // cross-network latency), reset state and increase backoff for next retry
    if (this.connectionWatchdog) clearTimeout(this.connectionWatchdog);
    this.connectionWatchdog = setTimeout(() => {
      if (!this.isConnected && !this.isDisposed) {
        console.log('[WebRTC] Guest: connection attempt timed out — scheduling retry with backoff');
        this.isConnecting = false;
        this.consecutiveFailures++;
        this.increaseGuestBackoff();
        this.checkEscalatingReconnect();
      }
    }, 8000);

    // 1. Data Connection (Immediate handshake)
    try { this.dataConn?.close(); } catch {}
    const conn = this.peer.connect(hostId, { reliable: true });
    this.dataConn = conn;

    conn.on('open', () => {
      console.log('[WebRTC] Guest: data channel OPEN with host');
      this.isConnecting = false;
      this.consecutiveFailures = 0;
      this.guestRetryBackoffMs = WebRTCAudioEngine.GUEST_RETRY_MIN_MS;
      this.stopGuestCallLoop();
      this.updateStatus('Connected to Host ✓ (P2P Call Active)', true);
    });

    conn.on('data', (data: any) => {
      if (data?.type === '__ping__') return; // ignore internal keepalive
      if (data?.type === '__TRACK_UPDATED__') {
        console.log('[WebRTC] Guest: host updated audio track — refreshing playback');
        if (this.remoteStream) {
          this.handleRemoteStream(this.remoteStream);
        }
        return;
      }
      this.onSignal?.(data);
    });

    conn.on('close', () => {
      this.isConnecting = false;
      this.lastRemoteTrackId = null;
      this.handleDisconnect('Host disconnected — retrying…');
      this.startGuestCallLoop();
    });

    conn.on('error', (e) => {
      console.warn('[WebRTC] Guest data conn error:', e);
      this.isConnecting = false;
      this.increaseGuestBackoff();
    });

    // 2. Audio Media Call
    try { this.mediaConn?.close(); } catch {}
    const guestStream = getEnsuredAudioStream(this.localStream);
    const call = this.peer.call(hostId, guestStream);

    if (call) {
      this.mediaConn = call;

      call.on('stream', (remoteStream) => {
        this.isConnecting = false;
        this.consecutiveFailures = 0;
        this.stopGuestCallLoop();
        this.handleRemoteStream(remoteStream);
      });

      // [FIX 4 + FIX 7] Attach unified ICE diagnostics with proper restart
      const pc = (call as any).peerConnection as RTCPeerConnection;
      if (pc) {
        pc.ontrack = (event) => {
          const stream = event.streams[0] || new MediaStream([event.track]);
          this.isConnecting = false;
          this.consecutiveFailures = 0;
          this.stopGuestCallLoop();
          this.handleRemoteStream(stream);
        };

        this.attachIceDiagnostics(pc, 'Guest');
      }

      call.on('close', () => {
        this.isConnecting = false;
        this.lastRemoteTrackId = null;
        this.handleDisconnect('Host audio stream closed');
      });

      call.on('error', (e) => {
        console.warn('[WebRTC] Guest call error:', e);
        this.isConnecting = false;
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────

  /**
   * Updates the microphone stream.
   * If a call is already active, updates the RTP sender track on the fly.
   */
  public async setLocalStream(stream: MediaStream): Promise<void> {
    this.localStream = stream;
    const audioTrack = stream.getAudioTracks()[0];
    console.log(`[WebRTC] ${this.role} setLocalStream with track:`, audioTrack?.label);

    if (!audioTrack) return;

    // Skip if this exact local track is already attached
    if (this.lastLocalTrackId === audioTrack.id) return;
    this.lastLocalTrackId = audioTrack.id;

    let trackReplaced = false;
    if (this.mediaConn) {
      const pc = (this.mediaConn as unknown as { peerConnection?: RTCPeerConnection }).peerConnection;
      if (pc) {
        const senders = pc.getSenders();
        const audioSenders = senders.filter((s) => !s.track || s.track.kind === 'audio');
        for (const sender of audioSenders) {
          try {
            await sender.replaceTrack(audioTrack);
            trackReplaced = true;
            console.log(`[WebRTC] ${this.role} replaced active audio track with live mic`);
          } catch (e) {
            console.warn('[WebRTC] replaceTrack error:', e);
          }
        }
      }
    }

    // Send track update signal over data connection
    this.sendSignal({ type: '__TRACK_UPDATED__', timestamp: Date.now() });

    // If Guest and not connected or track replacement was not possible, initiate/refresh call
    if (this.role === 'guest' && this.peer && !this.peer.destroyed && !this.isDisposed) {
      if (!this.isConnected || !this.mediaConn || !trackReplaced) {
        console.log('[WebRTC] Guest: initiating call with live microphone stream…');
        this.isConnecting = false;
        this.attemptGuestCall();
      }
    }
  }

  /**
   * Send control data to the peer via DataConnection.
   */
  public sendSignal(message: any): void {
    if (this.dataConn && this.dataConn.open) {
      try {
        this.dataConn.send(message);
      } catch (e) {
        console.warn('[WebRTC] sendSignal error:', e);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────────────────

  private handleDisconnect(msg: string) {
    if (this.isDisposed) return;
    this.isConnected = false;
    this.remoteStream = null;
    this.updateStatus(msg, false);
  }

  private scheduleReconnect(delayMs: number) {
    if (this.isDisposed) return;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      if (this.isDisposed || this.isConnected) return;
      console.log(`[WebRTC] Reconnecting peer as ${this.role}…`);
      try { this.peer?.destroy(); } catch {}
      this.peer = null;
      this.initPeer();
    }, delayMs);
  }

  private updateStatus(text: string, connected: boolean = false) {
    this.isConnected = connected;
    this.onStatusChange?.({
      connected,
      role: this.role,
      remoteStream: this.remoteStream,
      statusText: text,
    });
  }

  public dispose() {
    this.isDisposed = true;
    this.stopGuestCallLoop();
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.connectionWatchdog) clearTimeout(this.connectionWatchdog);
    try { this.mediaConn?.close(); } catch {}
    try { this.dataConn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.peer = null;
    this.mediaConn = null;
    this.dataConn = null;
    this.remoteStream = null;
  }
}
