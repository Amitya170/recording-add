/**
 * WebRTCAudioEngine — Real-Time Peer-to-Peer Audio Connection Engine.
 * Manages RTCPeerConnection for low-latency, dual-mono audio streaming
 * between remote Host and Guest speakers with automatic signaling and candidate queuing.
 */

export interface WebRTCStatus {
  connected: boolean;
  role: 'host' | 'guest';
  remoteStream: MediaStream | null;
  statusText: string;
}

export class WebRTCAudioEngine {
  private peerConnection: RTCPeerConnection | null = null;
  private channel: BroadcastChannel | null = null;
  private remoteStream: MediaStream | null = null;
  private localStream: MediaStream | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  public role: 'host' | 'guest';
  public onStatusChange?: (status: WebRTCStatus) => void;
  public onRemoteStream?: (stream: MediaStream) => void;
  public onSignal?: (message: any) => void;

  public isConnected: boolean = false;
  private statusText: string = 'Idle';

  constructor(role: 'host' | 'guest', sessionToken: string = 'podcast_default_session') {
    this.role = role;
    this.channel = new BroadcastChannel(`webrtc_session_${sessionToken}`);
    this.initChannel();
    this.startPresenceHeartbeat();
  }

  public sendSignal(message: any) {
    if (this.channel) {
      this.channel.postMessage({ type: 'CUSTOM_SIGNAL', data: message });
    }
  }

  private updateStatus(text: string, connected: boolean = false) {
    this.statusText = text;
    this.isConnected = connected;
    if (this.onStatusChange) {
      this.onStatusChange({
        connected: this.isConnected,
        role: this.role,
        remoteStream: this.remoteStream,
        statusText: this.statusText,
      });
    }
  }

  private startPresenceHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (!this.isConnected && this.channel) {
        if (this.role === 'guest') {
          this.channel.postMessage({ type: 'JOIN_REQUEST', role: 'guest' });
        } else {
          this.channel.postMessage({ type: 'HOST_ONLINE', role: 'host' });
        }
      }
    }, 1500);
  }

  private initChannel() {
    if (!this.channel) return;

    this.channel.onmessage = async (event) => {
      const { type, data } = event.data || {};

      if (type === 'CUSTOM_SIGNAL' && this.onSignal) {
        this.onSignal(data);
      } else if (type === 'HOST_ONLINE' && this.role === 'guest') {
        if (!this.isConnected) {
          this.channel?.postMessage({ type: 'JOIN_REQUEST', role: 'guest' });
        }
      } else if (type === 'JOIN_REQUEST' && this.role === 'host') {
        // Guest joined, Host creates Offer if not already connecting
        const pc = this.peerConnection || this.setupPeerConnection();
        if (pc.signalingState === 'stable') {
          await this.createOffer();
        }
      } else if (type === 'OFFER' && this.role === 'guest') {
        await this.handleOffer(data);
      } else if (type === 'ANSWER' && this.role === 'host') {
        await this.handleAnswer(data);
      } else if (type === 'ICE_CANDIDATE') {
        if (data) {
          if (this.peerConnection && this.peerConnection.remoteDescription) {
            try {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(data));
            } catch (e) {
              console.warn('addIceCandidate error:', e);
            }
          } else {
            this.pendingCandidates.push(data);
          }
        }
      }
    };

    if (this.role === 'guest') {
      this.updateStatus('Connecting to Host...', false);
      setTimeout(() => {
        this.channel?.postMessage({ type: 'JOIN_REQUEST', role: 'guest' });
      }, 300);
    } else {
      this.updateStatus('Waiting for Remote Guest...', false);
      setTimeout(() => {
        this.channel?.postMessage({ type: 'HOST_ONLINE', role: 'host' });
      }, 300);
    }
  }

  private setupPeerConnection(): RTCPeerConnection {
    if (this.peerConnection) return this.peerConnection;

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    });

    // Ensure audio transceiver exists for bi-directional communication
    try {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
    } catch {
      // Ignore if transceiver not supported in environment
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.channel?.postMessage({
          type: 'ICE_CANDIDATE',
          data: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
      this.remoteStream = stream;
      this.updateStatus('Connected (WebRTC Audio Live)', true);
      if (this.onRemoteStream) {
        this.onRemoteStream(stream);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.updateStatus('Connected (WebRTC Audio Live)', true);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.updateStatus('Disconnected — Reconnecting...', false);
      }
    };

    this.peerConnection = pc;

    // Attach local stream tracks if available
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    return pc;
  }

  private async flushPendingCandidates() {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    while (this.pendingCandidates.length > 0) {
      const candidate = this.pendingCandidates.shift();
      if (candidate) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('Error flushing ICE candidate:', e);
        }
      }
    }
  }

  public async setLocalStream(stream: MediaStream) {
    this.localStream = stream;
    const pc = this.peerConnection || this.setupPeerConnection();

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    const senders = pc.getSenders();
    const existingSender = senders.find((s) => s.track && s.track.kind === 'audio');

    if (existingSender) {
      await existingSender.replaceTrack(audioTrack);
    } else {
      pc.addTrack(audioTrack, stream);
    }
  }

  public async replaceLocalTrack(newTrack: MediaStreamTrack): Promise<void> {
    if (!this.peerConnection) return;
    const senders = this.peerConnection.getSenders();
    const sender = senders.find((s) => s.track && s.track.kind === 'audio');
    if (sender) {
      await sender.replaceTrack(newTrack);
    } else if (this.localStream) {
      this.peerConnection.addTrack(newTrack, this.localStream);
    }
  }

  public async createOffer() {
    const pc = this.peerConnection || this.setupPeerConnection();
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
      });
      await pc.setLocalDescription(offer);
      this.channel?.postMessage({ type: 'OFFER', data: offer });
      this.updateStatus('Signaling Remote Guest...', false);
    } catch (e) {
      console.error('Error creating WebRTC offer:', e);
    }
  }

  private async handleOffer(offerSDP: RTCSessionDescriptionInit) {
    const pc = this.peerConnection || this.setupPeerConnection();
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offerSDP));
      await this.flushPendingCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.channel?.postMessage({ type: 'ANSWER', data: answer });
      this.updateStatus('Connected (WebRTC Audio Live)', true);
    } catch (e) {
      console.error('Error handling WebRTC offer:', e);
    }
  }

  private async handleAnswer(answerSDP: RTCSessionDescriptionInit) {
    if (this.peerConnection) {
      try {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answerSDP));
        await this.flushPendingCandidates();
        this.updateStatus('Connected (WebRTC Audio Live)', true);
      } catch (e) {
        console.error('Error handling WebRTC answer:', e);
      }
    }
  }

  public dispose() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}

