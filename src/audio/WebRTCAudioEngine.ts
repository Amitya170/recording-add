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
let cachedIceServers: RTCIceServer[] | null = null;

const DEFAULT_METERED_APP_NAME = 'amitya';
const DEFAULT_METERED_API_KEY = '0e01ebea1f2f07f3375ea87d3093ba05d791';

async function fetchIceServers(): Promise<RTCIceServer[]> {
  // Return cached result if we already fetched
  if (cachedIceServers) return cachedIceServers;

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
    console.log('[WebRTC] Live TURN credentials successfully loaded from Metered.ca:', meteredServers.length, 'relay servers active');
    return cachedIceServers;
  } catch (e) {
    console.error('[WebRTC] Failed to fetch TURN credentials from Metered.ca:', e);
    cachedIceServers = STUN_SERVERS;
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
  private lastAttachedTrackId: string | null = null;

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

  private async initPeer() {
    if (this.isDisposed) return;

    const peerId = this.role === 'host'
      ? `pcs_host_${this.sessionToken}`
      : undefined;

    this.updateStatus(this.role === 'host'
      ? 'Waiting for Guest to Join…'
      : 'Connecting to Host Studio Room…');

    // Fetch TURN credentials dynamically (cached after first call)
    const iceServers = await fetchIceServers();

    try {
      this.peer = new Peer(peerId as string, {
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
          this.updateStatus('Waiting for Host to be online in studio… (Retrying)', false);
          this.isConnecting = false;
          if (this.role === 'guest') {
            setTimeout(() => {
              if (!this.isConnected && !this.isDisposed) {
                this.attemptGuestCall();
              }
            }, 3000);
          }
          break;
        case 'network':
        case 'disconnected':
        case 'server-error':
          this.updateStatus('Signaling reconnecting…');
          this.isConnecting = false;
          try { this.peer?.reconnect(); } catch {}
          this.scheduleReconnect(3000);
          break;
        default:
          this.updateStatus(`Connecting (${err.type})…`);
          this.isConnecting = false;
          this.scheduleReconnect(5000);
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
  // Remote Stream Handler (Deduplicated)
  // ──────────────────────────────────────────────────────────────

  private handleRemoteStream(stream: MediaStream) {
    if (this.isDisposed) return;
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) return;

    const trackId = tracks[0].id;
    tracks.forEach((t) => {
      t.enabled = true;
    });

    if (this.lastAttachedTrackId === trackId && this.remoteStream) {
      return; // Already attached and active
    }

    this.lastAttachedTrackId = trackId;
    this.remoteStream = stream;
    this.isConnected = true;
    console.log(`[WebRTC] ${this.role}: remote live audio stream active, track ID: ${trackId}`);

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
      });

      conn.on('data', (data: any) => {
        if (data?.type === '__ping__') return; // ignore internal keepalive
        if (data?.type === '__TRACK_UPDATED__') {
          console.log('[WebRTC] Host: guest updated audio track');
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

      // Attach to RTCPeerConnection ontrack & ICE handlers
      const pc = (call as any).peerConnection as RTCPeerConnection;
      if (pc) {
        pc.ontrack = (event) => {
          const stream = event.streams[0] || new MediaStream([event.track]);
          this.handleRemoteStream(stream);
        };

        // Log ICE candidate types for NAT traversal diagnostics
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const c = event.candidate;
            console.log(`[WebRTC] Host ICE candidate: type=${c.type} protocol=${c.protocol} address=${c.address}:${c.port}`);
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log('[WebRTC] Host ICE state:', pc.iceConnectionState);
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            this.updateStatus('Guest Connected ✓ (Audio Live)', true);
          } else if (pc.iceConnectionState === 'failed') {
            console.warn('[WebRTC] Host ICE failed across networks — attempting ICE restart');
            if (typeof (pc as any).restartIce === 'function') {
              try { (pc as any).restartIce(); } catch {}
            } else {
              this.handleDisconnect('Connection interrupted — waiting for guest…');
            }
          }
        };
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

    // Active WAN call loop: automatically retries every 5 seconds until connected
    this.guestCallRetryInterval = setInterval(() => {
      if (!this.isConnected && !this.isDisposed) {
        console.log('[WebRTC] Guest: checking/retrying P2P connection to Host…');
        this.attemptGuestCall();
      } else if (this.isConnected) {
        this.stopGuestCallLoop();
      }
    }, 5000);
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

  public retryConnection() {
    console.log(`[WebRTC] Manual retry triggered for ${this.role}`);
    if (this.role === 'guest') {
      this.isConnecting = false;
      this.lastAttachedTrackId = null;
      this.attemptGuestCall();
    } else {
      this.scheduleReconnect(500);
    }
  }

  private attemptGuestCall() {
    if (!this.peer || this.peer.destroyed || this.isDisposed || this.isConnecting) return;
    this.isConnecting = true;

    const hostId = `pcs_host_${this.sessionToken}`;
    console.log('[WebRTC] Guest: connecting to host ID:', hostId);

    // Watchdog: If connection doesn't open within 4.5s, reset state for next retry
    if (this.connectionWatchdog) clearTimeout(this.connectionWatchdog);
    this.connectionWatchdog = setTimeout(() => {
      if (!this.isConnected && !this.isDisposed) {
        console.log('[WebRTC] Host handshake in progress or waiting for host…');
        this.isConnecting = false;
      }
    }, 4500);

    // 1. Data Connection (Immediate handshake)
    try { this.dataConn?.close(); } catch {}
    const conn = this.peer.connect(hostId, { reliable: true });
    this.dataConn = conn;

    conn.on('open', () => {
      console.log('[WebRTC] Guest: data channel OPEN with host');
      this.isConnecting = false;
      this.stopGuestCallLoop();
      this.updateStatus('Connected to Host ✓ (P2P Call Active)', true);
    });

    conn.on('data', (data: any) => {
      if (data?.type === '__ping__') return; // ignore internal keepalive
      if (data?.type === '__TRACK_UPDATED__') {
        console.log('[WebRTC] Guest: host updated audio track');
        return;
      }
      this.onSignal?.(data);
    });

    conn.on('close', () => {
      this.isConnecting = false;
      this.lastAttachedTrackId = null;
      this.handleDisconnect('Host disconnected — retrying…');
      this.startGuestCallLoop();
    });

    conn.on('error', (e) => {
      console.warn('[WebRTC] Guest data conn error:', e);
      this.isConnecting = false;
    });

    // 2. Audio Media Call
    try { this.mediaConn?.close(); } catch {}
    const guestStream = getEnsuredAudioStream(this.localStream);
    const call = this.peer.call(hostId, guestStream);

    if (call) {
      this.mediaConn = call;

      call.on('stream', (remoteStream) => {
        this.isConnecting = false;
        this.stopGuestCallLoop();
        this.handleRemoteStream(remoteStream);
      });

      const pc = (call as any).peerConnection as RTCPeerConnection;
      if (pc) {
        pc.ontrack = (event) => {
          const stream = event.streams[0] || new MediaStream([event.track]);
          this.isConnecting = false;
          this.stopGuestCallLoop();
          this.handleRemoteStream(stream);
        };

        // Log ICE candidate types for NAT traversal diagnostics
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const c = event.candidate;
            console.log(`[WebRTC] Guest ICE candidate: type=${c.type} protocol=${c.protocol} address=${c.address}:${c.port}`);
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log('[WebRTC] Guest ICE state:', pc.iceConnectionState);
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            this.isConnecting = false;
            this.stopGuestCallLoop();
            this.updateStatus('Connected to Host ✓ (Audio Live)', true);
          } else if (pc.iceConnectionState === 'failed') {
            console.warn('[WebRTC] Guest ICE failed across networks — triggering ICE restart');
            if (typeof (pc as any).restartIce === 'function') {
              try { (pc as any).restartIce(); } catch {}
            } else {
              this.isConnecting = false;
              this.handleDisconnect('Host disconnected — retrying…');
            }
          }
        };
      }

      call.on('close', () => {
        this.isConnecting = false;
        this.lastAttachedTrackId = null;
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
    this.lastAttachedTrackId = null;
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
    this.lastAttachedTrackId = null;
  }
}

