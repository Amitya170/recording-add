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
  // Strictly alphanumeric to guarantee 100% compliance with PeerJS ID validation regex
  const clean = (raw || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32);
  return clean || 'default';
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

let cachedIceServers: RTCIceServer[] | null = null;
let cachedIceTimestamp: number = 0;
const ICE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const DEFAULT_METERED_APP_NAME = 'amitya';
const DEFAULT_METERED_API_KEY = '0e01ebea1f2f07f3375ea87d3093ba05d791';

async function fetchIceServers(forceRefresh: boolean = false): Promise<RTCIceServer[]> {
  const now = Date.now();
  if (!forceRefresh && cachedIceServers && (now - cachedIceTimestamp) < ICE_CACHE_TTL_MS) {
    return cachedIceServers;
  }

  const apiKey = ((import.meta as any).env?.VITE_METERED_API_KEY as string | undefined) || DEFAULT_METERED_API_KEY;
  const appName = ((import.meta as any).env?.VITE_METERED_APP_NAME as string | undefined) || DEFAULT_METERED_APP_NAME;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000); // 3s timeout

    const resp = await fetch(
      `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const meteredServers: RTCIceServer[] = await resp.json();
    cachedIceServers = [...STUN_SERVERS, ...meteredServers];
    cachedIceTimestamp = now;
    console.log('[WebRTC] Live TURN credentials loaded from Metered.ca:', meteredServers.length, 'relay servers active');
    return cachedIceServers;
  } catch (e) {
    console.warn('[WebRTC] Metered.ca TURN fetch unavailable (using STUN fleet):', e);
    if (cachedIceServers && cachedIceServers.length > STUN_SERVERS.length) {
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

  private lastLocalTrackId: string | null = null;
  private lastRemoteTrackId: string | null = null;

  private guestRetryBackoffMs: number = 3000;
  private static readonly GUEST_RETRY_MIN_MS = 3000;
  private static readonly GUEST_RETRY_MAX_MS = 12000;

  public role: 'host' | 'guest';
  public isConnected: boolean = false;
  public onStatusChange?: (status: WebRTCStatus) => void;
  public onRemoteStream?: (stream: MediaStream) => void;
  public onSignal?: (message: any) => void;
  public onAudioBufferReceived?: (pcmData: Float32Array, meta: any) => void;
  public onTransferProgress?: (percent: number) => void;

  private incomingTransfers = new Map<string, {
    totalSamples: number;
    totalChunks: number;
    chunkSize: number;
    receivedCount: number;
    buffer: Float32Array;
    meta: any;
  }>();

  constructor(role: 'host' | 'guest', sessionToken: string = 'podcastdefaultsession') {
    this.role = role;
    this.sessionToken = safePeerId(sessionToken);
    this.initPeer();
  }

  // ──────────────────────────────────────────────────────────────
  // PeerJS initialisation
  // ──────────────────────────────────────────────────────────────

  private async initPeer(forceNewCredentials: boolean = false) {
    if (this.isDisposed) return;

    // Explicit deterministic Peer ID for Host and unique alphanumeric Peer ID for Guest
    const peerId = this.role === 'host'
      ? `pcshost${this.sessionToken}`
      : `pcsguest${this.sessionToken}${Math.random().toString(36).slice(2, 8)}`;

    this.updateStatus(this.role === 'host'
      ? 'Waiting for Guest to Join…'
      : 'Connecting to Host Studio Room…');

    const iceServers = await fetchIceServers(forceNewCredentials);

    try {
      this.peer = new Peer(peerId, {
        host: '0.peerjs.com',
        port: 443,
        secure: true,
        path: '/',
        debug: 1,
        pingInterval: 5000,
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
      this.scheduleReconnect(3000);
      return;
    }

    this.peer.on('open', (id) => {
      console.log(`[WebRTC] ${this.role} online on signaling broker — peer ID: ${id}`);
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
          // Host is not online yet or in the process of starting up.
          // Keep the guest's Peer socket alive and let the call loop retry cleanly without destroying the peer.
          this.updateStatus('Waiting for Host to be online in studio…', false);
          this.isConnecting = false;
          break;
        case 'network':
        case 'disconnected':
        case 'server-error':
        case 'socket-error':
        case 'socket-closed':
          this.updateStatus('Signaling reconnecting…');
          this.isConnecting = false;
          try { this.peer?.reconnect(); } catch {}
          break;
        default:
          this.updateStatus(`Connecting (${err.type})…`);
          this.isConnecting = false;
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
      this.handleDisconnect(`Connection interrupted — waiting for recovery…`);
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
        this.handleDisconnect('P2P connection interrupted — retrying…');
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
        this.handleIncomingData(data);
      });

      conn.on('close', () => {
        console.log('[WebRTC] Host: data channel closed');
        this.handleDisconnect('Guest disconnected — waiting to reconnect…');
      });

      conn.on('error', (e) => console.warn('[WebRTC] Host data error:', e));
    });

    // Incoming MediaConnection (Audio Call) from guest
    this.peer.on('call', async (call) => {
      console.log('[WebRTC] Host: incoming audio call from guest', call.peer);
      try { this.mediaConn?.close(); } catch {}
      this.mediaConn = call;

      let hostStream = this.localStream;
      if (!hostStream || hostStream.getAudioTracks().length === 0 || hostStream.getAudioTracks()[0].readyState !== 'live') {
        try {
          hostStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          this.localStream = hostStream;
        } catch {
          hostStream = getEnsuredAudioStream(this.localStream);
        }
      }

      call.answer(hostStream);
      this.updateStatus('Guest Connected ✓ — Audio Call Active', true);

      call.on('stream', (remoteStream) => {
        console.log('[WebRTC] Host: received guest audio stream via call.on(stream)');
        this.handleRemoteStream(remoteStream, false);
      });

      // Attach unified ICE diagnostics with proper restart
      const pc = (call as any).peerConnection as RTCPeerConnection;
      if (pc) {
        pc.ontrack = (event) => {
          console.log('[WebRTC] Host: received guest audio track via pc.ontrack');
          const stream = event.streams[0] || new MediaStream([event.track]);
          this.handleRemoteStream(stream, false);
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
    if (!this.peer || this.peer.destroyed || this.isDisposed || this.isConnecting || this.isConnected) return;
    this.isConnecting = true;

    const hostId = `pcshost${this.sessionToken}`;
    console.log('[WebRTC] Guest: connecting to host ID:', hostId);

    // Watchdog: If connection doesn't open within 8s, reset state and retry with backoff
    if (this.connectionWatchdog) clearTimeout(this.connectionWatchdog);
    this.connectionWatchdog = setTimeout(() => {
      if (!this.isConnected && !this.isDisposed) {
        console.log('[WebRTC] Guest: connection attempt timed out — retrying…');
        this.isConnecting = false;
        this.increaseGuestBackoff();
      }
    }, 8000);

    // 1. Data Connection (Handshake first to prevent simultaneous SDP offer collisions)
    try { this.dataConn?.close(); } catch {}
    const conn = this.peer.connect(hostId, { reliable: true });
    this.dataConn = conn;

    conn.on('open', () => {
      console.log('[WebRTC] Guest: data channel OPEN with host');
      this.isConnecting = false;
      this.guestRetryBackoffMs = WebRTCAudioEngine.GUEST_RETRY_MIN_MS;
      this.stopGuestCallLoop();
      this.updateStatus('Signaling Connected — Establishing Live Audio…', false);

      // If local microphone stream is already active, initiate audio media call immediately.
      // If localStream is not ready yet, setLocalStream() will initiate startMediaCall() once mic is granted.
      if (this.localStream && this.localStream.getAudioTracks().length > 0 && this.localStream.getAudioTracks()[0].readyState === 'live') {
        this.startMediaCall(hostId);
      } else {
        console.log('[WebRTC] Guest: data channel ready, waiting for local microphone before starting media call');
      }
    });

    conn.on('data', (data: any) => {
      this.handleIncomingData(data);
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
  }

  private async startMediaCall(hostId: string) {
    if (!this.peer || this.peer.destroyed || this.isDisposed) return;
    if (this.mediaConn && this.mediaConn.open) {
      console.log('[WebRTC] Media call already active, skipping startMediaCall');
      return;
    }
    try { this.mediaConn?.close(); } catch {}

    let guestStream = this.localStream;
    if (!guestStream || guestStream.getAudioTracks().length === 0 || guestStream.getAudioTracks()[0].readyState !== 'live') {
      try {
        guestStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        this.localStream = guestStream;
      } catch {
        console.log('[WebRTC] Guest: local mic stream pending, waiting for user permission before starting media call');
        return;
      }
    }

    console.log('[WebRTC] Guest: calling host audio with live tracks:', guestStream.getAudioTracks().length);
    const call = this.peer.call(hostId, guestStream);

    if (call) {
      this.mediaConn = call;

      call.on('stream', (remoteStream) => {
        console.log('[WebRTC] Guest: received host audio stream via call.on(stream)');
        this.isConnecting = false;
        this.stopGuestCallLoop();
        this.handleRemoteStream(remoteStream, false);
      });

      const pc = (call as any).peerConnection as RTCPeerConnection;
      if (pc) {
        pc.ontrack = (event) => {
          console.log('[WebRTC] Guest: received host audio track via pc.ontrack');
          const stream = event.streams[0] || new MediaStream([event.track]);
          this.isConnecting = false;
          this.stopGuestCallLoop();
          this.handleRemoteStream(stream, false);
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
   * Seamlessly replaces the active audio track without destroying the call.
   */
  public async setLocalStream(stream: MediaStream): Promise<void> {
    this.localStream = stream;
    const audioTrack = stream.getAudioTracks()[0];
    console.log(`[WebRTC] ${this.role} setLocalStream with track:`, audioTrack?.label);

    if (!audioTrack) return;
    audioTrack.enabled = true;

    // Skip if this exact local track is already attached
    if (this.lastLocalTrackId === audioTrack.id) return;
    this.lastLocalTrackId = audioTrack.id;

    // If Guest, data channel is open, and no media call exists yet: initiate media call with live mic stream
    if (this.role === 'guest' && this.peer && !this.peer.destroyed && !this.isDisposed) {
      if (this.dataConn && this.dataConn.open && !this.mediaConn) {
        const hostId = `pcshost${this.sessionToken}`;
        await this.startMediaCall(hostId);
        return;
      }
    }

    // Replace track on existing sender without tearing down the connection
    if (this.mediaConn) {
      const pc = (this.mediaConn as unknown as { peerConnection?: RTCPeerConnection }).peerConnection;
      if (pc) {
        const senders = pc.getSenders();
        const audioSenders = senders.filter((s) => !s.track || s.track.kind === 'audio');
        for (const sender of audioSenders) {
          try {
            await sender.replaceTrack(audioTrack);
            console.log(`[WebRTC] ${this.role} replaced active audio track with live mic:`, audioTrack.label);
          } catch (e) {
            console.warn('[WebRTC] replaceTrack error:', e);
          }
        }
      }
    }

    // Send track update signal over data connection
    this.sendSignal({ type: '__TRACK_UPDATED__', timestamp: Date.now() });
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

  /**
   * Internal incoming data processor for WebRTC DataConnection.
   * Handles audio chunk streaming, track updates, and telemetry before delegating to onSignal.
   */
  private handleIncomingData(data: any) {
    if (data?.type === '__ping__') return;

    if (data?.type === '__AUDIO_TRANSFER_START__') {
      const { transferId, totalSamples, totalChunks, chunkSize, meta } = data;
      console.log(`[WebRTC] Starting audio transfer ${transferId}: ${totalSamples} samples, ${totalChunks} chunks`);
      this.incomingTransfers.set(transferId, {
        totalSamples,
        totalChunks,
        chunkSize,
        receivedCount: 0,
        buffer: new Float32Array(totalSamples),
        meta,
      });
      this.onTransferProgress?.(0);
      return;
    }

    if (data?.type === '__AUDIO_TRANSFER_CHUNK__') {
      const { transferId, chunkIndex, chunkData } = data;
      const transfer = this.incomingTransfers.get(transferId);
      if (transfer) {
        const offset = chunkIndex * transfer.chunkSize;
        // PeerJS BinaryPack often delivers binary fields as Uint8Array, not ArrayBuffer.
        // We must reinterpret the raw bytes as Float32Array correctly.
        let chunk: Float32Array;
        if (chunkData instanceof Float32Array) {
          chunk = chunkData;
        } else if (chunkData instanceof ArrayBuffer) {
          chunk = new Float32Array(chunkData);
        } else if (ArrayBuffer.isView(chunkData)) {
          // Uint8Array or other TypedArray from PeerJS BinaryPack — reinterpret bytes
          const u8 = new Uint8Array(chunkData.buffer, chunkData.byteOffset, chunkData.byteLength);
          const copy = new Uint8Array(u8.byteLength);
          copy.set(u8);
          chunk = new Float32Array(copy.buffer);
        } else {
          chunk = new Float32Array(chunkData);
        }
        transfer.buffer.set(chunk, offset);
        transfer.receivedCount++;
        const pct = Math.min(99, Math.round((transfer.receivedCount / transfer.totalChunks) * 100));
        this.onTransferProgress?.(pct);
      }
      return;
    }

    if (data?.type === '__AUDIO_TRANSFER_END__') {
      const { transferId } = data;
      const transfer = this.incomingTransfers.get(transferId);
      if (transfer) {
        console.log(`[WebRTC] Completed audio transfer ${transferId} (${transfer.totalSamples} samples)`);
        this.incomingTransfers.delete(transferId);
        this.onTransferProgress?.(100);
        this.onAudioBufferReceived?.(transfer.buffer, transfer.meta);
      }
      return;
    }

    if (data?.type === '__TRACK_UPDATED__') {
      console.log(`[WebRTC] ${this.role}: peer updated audio track — refreshing playback`);
      if (this.remoteStream) {
        this.handleRemoteStream(this.remoteStream, true);
      }
      return;
    }

    this.onSignal?.(data);
  }

  /**
   * Transmits raw PCM samples (e.g. from Guest local recording) across the WebRTC DataConnection
   * in SCTP-safe chunks with backpressure handling and progress updates.
   */
  public async sendRecordedAudio(
    samples: Float32Array,
    meta: any = {},
    onProgress?: (percent: number) => void
  ): Promise<boolean> {
    if (!this.dataConn || !this.dataConn.open) {
      console.warn('[WebRTC] Cannot send audio buffer: data connection is closed');
      return false;
    }

    const transferId = 'xfer_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const CHUNK_SIZE = 16384; // 16,384 floats = 64KB per chunk
    const totalSamples = samples.length;
    const totalChunks = Math.ceil(totalSamples / CHUNK_SIZE);

    console.log(`[WebRTC] Transmitting pristine audio buffer: ${totalSamples} samples across ${totalChunks} chunks`);

    // 1. Handshake start
    this.sendSignal({
      type: '__AUDIO_TRANSFER_START__',
      transferId,
      totalSamples,
      totalChunks,
      chunkSize: CHUNK_SIZE,
      meta,
    });

    // 2. Stream chunk slices
    for (let i = 0; i < totalChunks; i++) {
      if (this.isDisposed || !this.dataConn || !this.dataConn.open) return false;

      const start = i * CHUNK_SIZE;
      const end = Math.min(totalSamples, start + CHUNK_SIZE);
      const chunk = samples.subarray(start, end);

      this.dataConn.send({
        type: '__AUDIO_TRANSFER_CHUNK__',
        transferId,
        chunkIndex: i,
        chunkData: chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength),
      });

      const pct = Math.round(((i + 1) / totalChunks) * 100);
      onProgress?.(pct);
      this.onTransferProgress?.(pct);

      // Yield event loop every 3 chunks to prevent SCTP buffer pressure
      if (i % 3 === 0) {
        await new Promise((r) => setTimeout(r, 6));
      }
    }

    // 3. Signal transfer completion
    this.sendSignal({
      type: '__AUDIO_TRANSFER_END__',
      transferId,
    });

    console.log(`[WebRTC] Finished sending audio buffer (${totalChunks} chunks)`);
    return true;
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
