/**
 * WebRTCAudioEngine — Cross-Device P2P Audio via PeerJS.
 *
 * Uses PeerJS (backed by a free hosted signaling server) so that Host and Guest
 * can connect across different machines / networks — unlike BroadcastChannel which
 * only works within the same browser on the same machine.
 *
 * Protocol:
 *   Host  → registers with a deterministic peer ID: `pcs_host_<sessionToken>`
 *   Guest → registers with a random peer ID, then calls the host's peer ID
 *
 * Connections per session:
 *   1x MediaConnection  — for audio (host mic ↔ guest mic)
 *   1x DataConnection   — for control signals (recording state, mute, etc.)
 */

import Peer, { type DataConnection, type MediaConnection } from 'peerjs';

export interface WebRTCStatus {
  connected: boolean;
  role: 'host' | 'guest';
  remoteStream: MediaStream | null;
  statusText: string;
}

// Make session token safe for use as a PeerJS peer ID
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
  private sessionToken: string;
  private isDisposed = false;

  public role: 'host' | 'guest';
  public isConnected: boolean = false;
  public onStatusChange?: (status: WebRTCStatus) => void;
  public onRemoteStream?: (stream: MediaStream) => void;
  public onSignal?: (message: unknown) => void;

  private statusText: string = 'Idle';

  constructor(role: 'host' | 'guest', sessionToken: string = 'podcast_default_session') {
    this.role = role;
    this.sessionToken = safePeerId(sessionToken);
    this.initPeer();
  }

  // ──────────────────────────────────────────────────────────────
  // PeerJS Initialisation
  // ──────────────────────────────────────────────────────────────

  private initPeer() {
    if (this.isDisposed) return;

    // Host gets a deterministic ID so guest can call it by name
    const peerId = this.role === 'host'
      ? `pcs_host_${this.sessionToken}`
      : undefined; // guest gets a random ID

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
      this.updateStatus('Failed to initialise — retrying…');
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
        this.connectToHost();
      }
    });

    this.peer.on('error', (err) => {
      console.warn(`[PeerJS] ${this.role} peer error:`, err.type, err.message);
      switch (err.type) {
        case 'unavailable-id':
          // Another host tab has the same ID — OK, just wait
          this.updateStatus('Session active elsewhere — waiting…');
          break;
        case 'peer-unavailable':
          this.updateStatus('Host not online yet — retrying…');
          this.scheduleReconnect(3000);
          break;
        case 'network':
        case 'disconnected':
        case 'server-error':
          this.updateStatus('Network error — reconnecting…');
          this.scheduleReconnect(4000);
          break;
        default:
          this.updateStatus(`Connection issue (${err.type}) — retrying…`);
          this.scheduleReconnect(5000);
      }
    });

    this.peer.on('disconnected', () => {
      if (!this.isConnected && !this.isDisposed) {
        this.updateStatus('Disconnected from server — reconnecting…');
        // Try to reconnect to PeerJS server (not to peer)
        try { this.peer?.reconnect(); } catch {}
        this.scheduleReconnect(4000);
      }
    });
  }

  // ──────────────────────────────────────────────────────────────
  // HOST: listen for incoming calls and data connections
  // ──────────────────────────────────────────────────────────────

  private listenAsHost() {
    if (!this.peer) return;

    // Handle incoming audio call from guest
    this.peer.on('call', (call) => {
      console.log('[PeerJS] Host answering call from:', call.peer);
      this.mediaConn = call;

      // Answer with host's local stream (sends host audio to guest)
      call.answer(this.localStream ?? new MediaStream());

      call.on('stream', (remoteStream) => {
        console.log('[PeerJS] Host received guest audio stream');
        this.remoteStream = remoteStream;
        this.updateStatus('Connected ✓ — Guest Audio Live', true);
        this.onRemoteStream?.(remoteStream);
      });

      call.on('close', () => this.handleDisconnect('Guest disconnected'));
      call.on('error', (e) => console.warn('[PeerJS] Host call error:', e));
    });

    // Handle incoming data channel from guest
    this.peer.on('connection', (conn) => {
      console.log('[PeerJS] Host data connection from:', conn.peer);
      this.dataConn = conn;
      conn.on('data', (data) => {
        if (this.onSignal) this.onSignal(data);
      });
      conn.on('error', (e) => console.warn('[PeerJS] Host data connection error:', e));
    });
  }

  // ──────────────────────────────────────────────────────────────
  // GUEST: call host and open a data channel
  // ──────────────────────────────────────────────────────────────

  private connectToHost() {
    if (!this.peer || this.isDisposed) return;

    const hostId = `pcs_host_${this.sessionToken}`;
    console.log('[PeerJS] Guest calling host:', hostId);

    // 1. Audio call (sends guest mic to host; receives host mic back)
    const call = this.peer.call(hostId, this.localStream ?? new MediaStream());
    if (!call) {
      console.warn('[PeerJS] peer.call() returned null — host may not be online');
      this.updateStatus('Host not available — retrying…');
      this.scheduleReconnect(3000);
      return;
    }
    this.mediaConn = call;

    call.on('stream', (remoteStream) => {
      console.log('[PeerJS] Guest received host audio stream');
      this.remoteStream = remoteStream;
      this.updateStatus('Connected ✓ — Host Audio Live', true);
      this.onRemoteStream?.(remoteStream);
    });

    call.on('close', () => this.handleDisconnect('Host disconnected — retrying…'));
    call.on('error', (e) => {
      console.warn('[PeerJS] Guest call error:', e);
      this.scheduleReconnect(4000);
    });

    // 2. Data channel (for recording state signals from host)
    const conn = this.peer.connect(hostId, { reliable: true });
    this.dataConn = conn;
    conn.on('open', () => console.log('[PeerJS] Guest data channel open'));
    conn.on('data', (data) => {
      if (this.onSignal) this.onSignal(data);
    });
    conn.on('error', (e) => console.warn('[PeerJS] Guest data connection error:', e));
  }

  // ──────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────

  /**
   * Set (or replace) the local mic stream.
   * Guest: re-calls the host with the new stream.
   * Host: stream is used on the next incoming call answer.
   */
  public async setLocalStream(stream: MediaStream): Promise<void> {
    this.localStream = stream;
    const tracks = stream.getAudioTracks();
    console.log(`[PeerJS] ${this.role} setLocalStream — ${tracks.length} audio tracks`);

    if (this.role === 'guest' && this.peer && !this.peer.destroyed && !this.isDisposed) {
      // Re-call host with the updated stream
      this.connectToHost();
    }
    // Host: new stream will be used on next call.answer() automatically
  }

  /**
   * Send a control signal to the remote peer via the DataConnection.
   * (e.g. recording state changes so the guest starts/stops recording)
   */
  public sendSignal(message: unknown): void {
    if (this.dataConn && this.dataConn.open) {
      try {
        this.dataConn.send(message);
      } catch (e) {
        console.warn('[PeerJS] sendSignal failed:', e);
      }
    } else {
      console.warn('[PeerJS] sendSignal called but data channel not open');
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────────────────

  private handleDisconnect(msg: string) {
    if (this.isDisposed) return;
    this.isConnected = false;
    this.updateStatus(msg, false);
    if (this.role === 'guest') {
      this.scheduleReconnect(5000);
    }
  }

  private scheduleReconnect(delayMs: number = 4000) {
    if (this.isDisposed) return;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      if (this.isDisposed || this.isConnected) return;
      console.log(`[PeerJS] Reconnect attempt as ${this.role}…`);
      if (this.peer && !this.peer.destroyed) {
        if (this.role === 'guest') {
          this.connectToHost();
        }
        // Host just waits for next incoming call
      } else {
        // Peer is gone — re-initialise entirely
        try { this.peer?.destroy(); } catch {}
        this.peer = null;
        this.initPeer();
      }
    }, delayMs);
  }

  private updateStatus(text: string, connected: boolean = false) {
    this.statusText = text;
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
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    try { this.mediaConn?.close(); } catch {}
    try { this.dataConn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.peer = null;
    this.mediaConn = null;
    this.dataConn = null;
  }
}
