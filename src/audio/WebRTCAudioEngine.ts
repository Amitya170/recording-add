/**
 * WebRTCAudioEngine — Robust Cross-Device P2P Audio via PeerJS + STUN/TURN.
 *
 * Designed to connect Host and Guest across separate devices and different networks/routers.
 *
 * Key Architecture:
 * 1. Deterministic host ID based on session token: `pcs_host_<sessionToken>`
 * 2. High-reliability ICE servers (Google STUN + Metered OpenRelay TURN) for full NAT traversal.
 * 3. Dual channel:
 *    - DataConnection: Immediate handshake & control signals (recording state, etc.)
 *    - MediaConnection: Full-duplex live microphone audio stream.
 * 4. Silent audio track fallback: Guarantees WebRTC SDP always contains valid audio m-lines
 *    even before the user selects their microphone hardware, allowing ICE candidates to gather immediately.
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
 * Creates a silent audio stream fallback if real microphone stream is not ready yet.
 * WebRTC across NATs requires a valid media track to exchange ICE candidate pairs.
 */
function getEnsuredAudioStream(stream: MediaStream | null): MediaStream {
  if (stream && stream.getAudioTracks().length > 0 && stream.getAudioTracks()[0].readyState === 'live') {
    return stream;
  }
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const dest = ctx.createMediaStreamDestination();
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    return dest.stream;
  } catch {
    return stream ?? new MediaStream();
  }
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export class WebRTCAudioEngine {
  private peer: Peer | null = null;
  private mediaConn: MediaConnection | null = null;
  private dataConn: DataConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private guestCallRetryInterval: ReturnType<typeof setInterval> | null = null;
  private sessionToken: string;
  private isDisposed = false;

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

  private initPeer() {
    if (this.isDisposed) return;

    const peerId = this.role === 'host'
      ? `pcs_host_${this.sessionToken}`
      : undefined;

    this.updateStatus(this.role === 'host'
      ? 'Waiting for Guest to Join…'
      : 'Connecting to Host…');

    try {
      this.peer = new Peer(peerId as string, {
        debug: 0,
        config: {
          iceServers: ICE_SERVERS,
          sdpSemantics: 'unified-plan',
        },
      });
    } catch (e) {
      console.error('[WebRTC] Peer creation error:', e);
      this.scheduleReconnect(4000);
      return;
    }

    this.peer.on('open', (id) => {
      console.log(`[WebRTC] ${this.role} online — peer ID: ${id}`);
      if (this.role === 'host') {
        this.updateStatus('Waiting for Guest to Join…');
        this.listenAsHost();
      } else {
        this.updateStatus('Connecting to Host…');
        this.startGuestCallLoop();
      }
    });

    this.peer.on('error', (err) => {
      console.warn(`[WebRTC] ${this.role} peer error:`, err.type, err.message);
      switch (err.type) {
        case 'unavailable-id':
          if (this.role === 'host') {
            this.updateStatus('Session ID in use — reconnecting…');
            this.scheduleReconnect(3000);
          }
          break;
        case 'peer-unavailable':
          this.updateStatus('Host not online yet — retrying…');
          break;
        case 'network':
        case 'disconnected':
        case 'server-error':
          this.updateStatus('Network issue — reconnecting…');
          this.scheduleReconnect(4000);
          break;
        default:
          this.updateStatus(`Connecting (${err.type})…`);
          this.scheduleReconnect(5000);
      }
    });

    this.peer.on('disconnected', () => {
      if (!this.isConnected && !this.isDisposed) {
        this.updateStatus('Reconnecting to server…');
        try { this.peer?.reconnect(); } catch {}
        this.scheduleReconnect(4000);
      }
    });
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

      conn.on('data', (data) => {
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
        console.log('[WebRTC] Host: received guest audio stream', remoteStream.id, 'tracks:', remoteStream.getAudioTracks().length);
        this.remoteStream = remoteStream;
        this.updateStatus('Guest Connected ✓ — Audio Live', true);
        this.onRemoteStream?.(remoteStream);
      });

      // Attach to RTCPeerConnection ontrack for real-time track replacement detection
      const pc = (call as any).peerConnection as RTCPeerConnection;
      if (pc) {
        pc.ontrack = (event) => {
          console.log('[WebRTC] Host: ontrack event:', event.track.id, event.streams.length);
          const stream = event.streams[0] || new MediaStream([event.track]);
          this.remoteStream = stream;
          this.updateStatus('Guest Connected ✓ — Audio Live', true);
          this.onRemoteStream?.(stream);
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

    this.guestCallRetryInterval = setInterval(() => {
      if (!this.isConnected && !this.isDisposed) {
        console.log('[WebRTC] Guest: retrying P2P call to Host…');
        this.attemptGuestCall();
      } else {
        this.stopGuestCallLoop();
      }
    }, 3500);
  }

  private stopGuestCallLoop() {
    if (this.guestCallRetryInterval) {
      clearInterval(this.guestCallRetryInterval);
      this.guestCallRetryInterval = null;
    }
  }

  private attemptGuestCall() {
    if (!this.peer || this.peer.destroyed || this.isDisposed) return;

    const hostId = `pcs_host_${this.sessionToken}`;
    console.log('[WebRTC] Guest: connecting to host ID:', hostId);

    // 1. Data Connection (Immediate handshake)
    try { this.dataConn?.close(); } catch {}
    const conn = this.peer.connect(hostId, { reliable: true });
    this.dataConn = conn;

    conn.on('open', () => {
      console.log('[WebRTC] Guest: data channel OPEN with host');
      this.stopGuestCallLoop();
      this.updateStatus('Connected to Host ✓ (P2P Call Active)', true);
    });

    conn.on('data', (data) => {
      this.onSignal?.(data);
    });

    conn.on('close', () => {
      this.handleDisconnect('Host disconnected — retrying…');
      this.startGuestCallLoop();
    });

    conn.on('error', (e) => {
      console.warn('[WebRTC] Guest data conn error:', e);
    });

    // 2. Audio Media Call
    try { this.mediaConn?.close(); } catch {}
    const guestStream = getEnsuredAudioStream(this.localStream);
    const call = this.peer.call(hostId, guestStream);

    if (call) {
      this.mediaConn = call;

      call.on('stream', (remoteStream) => {
        console.log('[WebRTC] Guest: received host audio stream', remoteStream.id, 'tracks:', remoteStream.getAudioTracks().length);
        this.remoteStream = remoteStream;
        this.stopGuestCallLoop();
        this.updateStatus('Connected to Host ✓ (Host Audio Live)', true);
        this.onRemoteStream?.(remoteStream);
      });

      const pc = (call as any).peerConnection as RTCPeerConnection;
      if (pc) {
        pc.ontrack = (event) => {
          console.log('[WebRTC] Guest: ontrack event:', event.track.id);
          const stream = event.streams[0] || new MediaStream([event.track]);
          this.remoteStream = stream;
          this.stopGuestCallLoop();
          this.updateStatus('Connected to Host ✓ (Host Audio Live)', true);
          this.onRemoteStream?.(stream);
        };
      }

      call.on('close', () => {
        this.handleDisconnect('Host audio stream closed');
      });

      call.on('error', (e) => {
        console.warn('[WebRTC] Guest call error:', e);
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

    if (this.mediaConn) {
      const pc = (this.mediaConn as unknown as { peerConnection?: RTCPeerConnection }).peerConnection;
      if (pc) {
        const senders = pc.getSenders();
        const audioSender = senders.find((s) => s.track?.kind === 'audio' || !s.track);
        if (audioSender) {
          try {
            await audioSender.replaceTrack(audioTrack);
            console.log(`[WebRTC] ${this.role} replaced active audio track successfully`);
            return; // Track replaced on live connection — no need to re-call
          } catch (e) {
            console.warn('[WebRTC] replaceTrack failed:', e);
          }
        }
      }
    }

    // Only re-call if there was no existing media connection to replaceTrack on
    if (this.role === 'guest' && this.peer && !this.peer.destroyed && !this.isDisposed) {
      console.log('[WebRTC] Guest: calling host with real microphone stream…');
      this.attemptGuestCall();
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
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    try { this.mediaConn?.close(); } catch {}
    try { this.dataConn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.peer = null;
    this.mediaConn = null;
    this.dataConn = null;
  }
}
