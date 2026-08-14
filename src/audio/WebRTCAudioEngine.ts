/**
 * WebRTCAudioEngine — Cross-Device P2P Audio via PeerJS.
 *
 * Uses PeerJS (backed by a free hosted signaling server) so that Host and Guest
 * can connect across different machines / networks.
 *
 * Protocol:
 *   Host  → registers as 'pcs_host_<sessionToken>'  (deterministic)
 *   Guest → registers with a random ID, then calls the host peer ID
 *
 * Two channels per session:
 *   MediaConnection — bidirectional audio (host mic ↔ guest mic)
 *   DataConnection  — control signals (recording state, mute, etc.)
 */

import Peer, { type DataConnection, type MediaConnection } from 'peerjs';

export interface WebRTCStatus {
  connected: boolean;
  role: 'host' | 'guest';
  remoteStream: MediaStream | null;
  statusText: string;
}

function safePeerId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
}

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
  public onSignal?: (message: unknown) => void;

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
        host: '0.peerjs.com',
        port: 443,
        path: '/',
        secure: true,
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            {
              urls: 'turn:openrelay.metered.ca:80',
              username: 'openrelayproject',
              credential: 'openrelayproject',
            },
            {
              urls: 'turn:openrelay.metered.ca:443',
              username: 'openrelayproject',
              credential: 'openrelayproject',
            },
          ],
        },
      });
    } catch (e) {
      console.error('[PeerJS] Peer creation error:', e);
      this.scheduleReconnect(5000);
      return;
    }

    this.peer.on('open', (id) => {
      console.log(`[PeerJS] ${this.role} open — peer ID: ${id}`);
      if (this.role === 'host') {
        this.updateStatus('Waiting for Guest to Join…');
        this.listenAsHost();
      } else {
        this.updateStatus('Calling Host…');
        // Start a retry loop so guest re-calls if host isn't online yet
        this.startGuestCallLoop();
      }
    });

    this.peer.on('error', (err) => {
      console.warn(`[PeerJS] ${this.role} error:`, err.type, err.message);
      switch (err.type) {
        case 'unavailable-id':
          // Host ID already taken by another session — just listen; PeerJS server
          // will route incoming calls to whichever peer holds the ID.
          if (this.role === 'host') {
            this.updateStatus('Session ID in use — reconnecting…');
            this.scheduleReconnect(3000);
          }
          break;
        case 'peer-unavailable':
          // Host not online yet — guest will retry via the call loop
          this.updateStatus('Host not online yet — retrying…');
          break;
        case 'network':
        case 'disconnected':
        case 'server-error':
          this.updateStatus('Network error — reconnecting…');
          this.scheduleReconnect(5000);
          break;
        default:
          this.updateStatus(`Issue (${err.type}) — retrying…`);
          this.scheduleReconnect(5000);
      }
    });

    this.peer.on('disconnected', () => {
      if (!this.isConnected && !this.isDisposed) {
        this.updateStatus('Reconnecting to server…');
        try { this.peer?.reconnect(); } catch {}
        this.scheduleReconnect(5000);
      }
    });
  }

  // ──────────────────────────────────────────────────────────────
  // HOST — listen for incoming calls
  // ──────────────────────────────────────────────────────────────

  private listenAsHost() {
    if (!this.peer) return;

    this.peer.on('call', (call) => {
      console.log('[PeerJS] Host: incoming call from guest', call.peer);
      // Close any old media connection first
      try { this.mediaConn?.close(); } catch {}
      this.mediaConn = call;

      // Answer with host's mic stream (or empty stream if not yet selected)
      call.answer(this.localStream ?? new MediaStream());

      // Mark connected immediately on answer — don't wait for guest's stream
      // (guest may have no mic yet; we still want UI to show "connected")
      this.updateStatus('Guest Connected ✓ — P2P Call Active', true);

      call.on('stream', (remoteStream) => {
        console.log('[PeerJS] Host: received guest audio stream');
        this.remoteStream = remoteStream;
        // Update status and deliver stream (only if tracks exist)
        if (remoteStream.getAudioTracks().length > 0) {
          this.updateStatus('Guest Connected ✓ — Audio Live', true);
          this.onRemoteStream?.(remoteStream);
        }
      });

      call.on('close', () => {
        console.log('[PeerJS] Host: guest call closed');
        this.handleDisconnect('Guest disconnected — waiting for reconnect…');
      });

      call.on('error', (e) => console.warn('[PeerJS] Host call error:', e));
    });

    // Incoming data channel from guest
    this.peer.on('connection', (conn) => {
      console.log('[PeerJS] Host: data connection from', conn.peer);
      try { this.dataConn?.close(); } catch {}
      this.dataConn = conn;
      conn.on('data', (data) => { this.onSignal?.(data); });
      conn.on('error', (e) => console.warn('[PeerJS] Host data error:', e));
    });
  }

  // ──────────────────────────────────────────────────────────────
  // GUEST — call host, retry until connected
  // ──────────────────────────────────────────────────────────────

  private startGuestCallLoop() {
    this.stopGuestCallLoop();
    // Try immediately, then retry every 4 seconds until connected
    this.attemptGuestCall();
    this.guestCallRetryInterval = setInterval(() => {
      if (!this.isConnected && !this.isDisposed) {
        console.log('[PeerJS] Guest: retry call to host…');
        this.attemptGuestCall();
      } else {
        this.stopGuestCallLoop();
      }
    }, 4000);
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
    console.log('[PeerJS] Guest: calling host peer ID:', hostId);

    // Close any existing media connection
    try { this.mediaConn?.close(); } catch {}

    // Call with local stream (or empty MediaStream if mic not yet selected)
    const stream = this.localStream ?? new MediaStream();
    const call = this.peer.call(hostId, stream);
    if (!call) {
      console.warn('[PeerJS] Guest: peer.call() returned null — host may be offline');
      return;
    }
    this.mediaConn = call;

    call.on('stream', (remoteStream) => {
      console.log('[PeerJS] Guest: received host audio stream');
      this.remoteStream = remoteStream;
      this.stopGuestCallLoop();
      this.updateStatus('Connected ✓ — Host Audio Live', true);
      this.onRemoteStream?.(remoteStream);
    });

    call.on('close', () => {
      if (!this.isDisposed) {
        this.handleDisconnect('Host disconnected — retrying…');
        this.startGuestCallLoop();
      }
    });

    call.on('error', (e) => {
      console.warn('[PeerJS] Guest call error:', e);
    });

    // Also open a data channel to host (for recording state signals)
    try { this.dataConn?.close(); } catch {}
    const conn = this.peer.connect(hostId, { reliable: true });
    this.dataConn = conn;
    conn.on('open', () => console.log('[PeerJS] Guest: data channel open'));
    conn.on('data', (data) => { this.onSignal?.(data); });
    conn.on('error', (e) => console.warn('[PeerJS] Guest data error:', e));
  }

  // ──────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────

  /**
   * Set the local mic stream.
   * - Host: the new stream is used on the next incoming call.answer()
   *         and immediately sent to any active call via replaceTrack.
   * - Guest: immediately re-calls the host with the new stream.
   */
  public async setLocalStream(stream: MediaStream): Promise<void> {
    this.localStream = stream;
    const trackCount = stream.getAudioTracks().length;
    console.log(`[PeerJS] ${this.role} setLocalStream — ${trackCount} audio tracks`);

    if (this.role === 'host' && this.mediaConn) {
      // Replace track in the existing call so guest hears updated host mic
      const pc = (this.mediaConn as unknown as { peerConnection: RTCPeerConnection }).peerConnection;
      if (pc) {
        const audioTrack = stream.getAudioTracks()[0];
        const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
        if (sender && audioTrack) {
          try { await sender.replaceTrack(audioTrack); } catch (e) { console.warn('[PeerJS] replaceTrack failed:', e); }
        }
      }
    } else if (this.role === 'guest') {
      // Re-call host with the new mic stream
      if (this.peer && !this.peer.destroyed && !this.isDisposed) {
        this.attemptGuestCall();
      }
    }
  }

  /** Send a control signal to the remote peer via DataConnection. */
  public sendSignal(message: unknown): void {
    if (this.dataConn?.open) {
      try { this.dataConn.send(message); } catch (e) {
        console.warn('[PeerJS] sendSignal error:', e);
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
      console.log(`[PeerJS] Full reconnect as ${this.role}…`);
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
