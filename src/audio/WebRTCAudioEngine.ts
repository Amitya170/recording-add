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
          if (this.peerConnection && this.peerConnection.connectionState !== 'connected') {
            try {
              this.peerConnection.close();
            } catch {}
            this.peerConnection = null;
          }
          this.channel?.postMessage({ type: 'JOIN_REQUEST', role: 'guest' });
        }
      } else if (type === 'JOIN_REQUEST' && this.role === 'host') {
        // Guest joined, cleanly re-initialize peer connection and create a fresh offer
        if (this.peerConnection) {
          try {
            this.peerConnection.close();
          } catch {}
          this.peerConnection = null;
        }
        this.setupPeerConnection();
        await this.createOffer();
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

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidateJSON = {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          usernameFragment: event.candidate.usernameFragment,
        };
        try {
          this.channel?.postMessage({
            type: 'ICE_CANDIDATE',
            data: JSON.parse(JSON.stringify(candidateJSON)),
          });
        } catch (err) {
          console.warn('Failed to post ICE candidate:', err);
        }
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

    // Add a sendrecv transceiver so SDP always negotiates bidirectional audio.
    // This must happen BEFORE createOffer/createAnswer so the SDP includes it.
    // If a local stream is already available, we set its track on the transceiver immediately.
    const transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        transceiver.sender.replaceTrack(audioTrack).catch(console.warn);
      }
    }

    this.peerConnection = pc;
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
    if (!audioTrack) {
      console.warn('setLocalStream: No audio track found in stream');
      return;
    }

    // Use the transceiver sender for the most reliable track replacement
    const transceivers = pc.getTransceivers();
    const audioTransceiver = transceivers.find((t) => t.sender.track?.kind === 'audio' || t.receiver.track?.kind === 'audio');
    if (audioTransceiver) {
      try {
        await audioTransceiver.sender.replaceTrack(audioTrack);
        console.log(`[WebRTC] ${this.role} local track replaced via transceiver`);
      } catch (e) {
        console.warn('replaceTrack via transceiver failed, using addTrack:', e);
        try { pc.addTrack(audioTrack, stream); } catch {}
      }
    } else {
      // Fallback: add track directly (less ideal but functional)
      try { pc.addTrack(audioTrack, stream); } catch {}
    }

    // If host is already in stable state, renegotiate
    if (this.role === 'host' && pc.signalingState === 'stable') {
      await this.createOffer();
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
      if (pc.signalingState !== 'stable') {
        console.warn('Cannot create offer in non-stable signaling state:', pc.signalingState);
        return;
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.channel?.postMessage({
        type: 'OFFER',
        data: {
          type: offer.type,
          sdp: offer.sdp,
        },
      });
      this.updateStatus('Signaling Remote Guest...', false);
    } catch (e) {
      console.error('Error creating WebRTC offer:', e);
    }
  }

  private async handleOffer(offerSDP: RTCSessionDescriptionInit) {
    const pc = this.peerConnection || this.setupPeerConnection();
    try {
      // Attach local track via transceiver sender BEFORE setting remote description
      if (this.localStream) {
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
          const transceivers = pc.getTransceivers();
          const audioTransceiver = transceivers.find(
            (t) => t.sender.track?.kind === 'audio' || t.receiver.track?.kind === 'audio'
          );
          if (audioTransceiver) {
            await audioTransceiver.sender.replaceTrack(audioTrack).catch(console.warn);
          } else {
            try { pc.addTrack(audioTrack, this.localStream); } catch {}
          }
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offerSDP));
      await this.flushPendingCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.channel?.postMessage({
        type: 'ANSWER',
        data: {
          type: answer.type,
          sdp: answer.sdp,
        },
      });
      this.updateStatus('Connected (WebRTC Audio Live)', true);
    } catch (e) {
      console.error('Error handling WebRTC offer:', e);
    }
  }

  private async handleAnswer(answerSDP: RTCSessionDescriptionInit) {
    if (this.peerConnection) {
      try {
        if (this.peerConnection.signalingState === 'have-local-offer') {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answerSDP));
          await this.flushPendingCandidates();
          this.updateStatus('Connected (WebRTC Audio Live)', true);
        }
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

