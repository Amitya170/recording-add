/**
 * WebRTCAudioEngine — Real-Time Peer-to-Peer Audio Connection Engine.
 * Manages RTCPeerConnection for low-latency, dual-mono audio streaming
 * between remote Host and Guest speakers.
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

  public role: 'host' | 'guest';
  public onStatusChange?: (status: WebRTCStatus) => void;
  public onRemoteStream?: (stream: MediaStream) => void;

  private isConnected: boolean = false;
  private statusText: string = 'Idle';

  constructor(role: 'host' | 'guest', sessionToken: string = 'podcast_default_session') {
    this.role = role;
    this.channel = new BroadcastChannel(`webrtc_session_${sessionToken}`);
    this.initChannel();
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

  private initChannel() {
    if (!this.channel) return;

    this.channel.onmessage = async (event) => {
      const { type, data } = event.data;

      if (type === 'OFFER' && this.role === 'guest') {
        await this.handleOffer(data);
      } else if (type === 'ANSWER' && this.role === 'host') {
        await this.handleAnswer(data);
      } else if (type === 'ICE_CANDIDATE') {
        if (this.peerConnection && data) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(data));
          } catch (e) {
            console.error('Error adding ICE candidate:', e);
          }
        }
      } else if (type === 'JOIN_REQUEST' && this.role === 'host') {
        // Guest joined, Host creates Offer
        this.createOffer();
      }
    };

    if (this.role === 'guest') {
      this.updateStatus('Connecting to Host...', false);
      // Announce guest presence
      setTimeout(() => {
        this.channel?.postMessage({ type: 'JOIN_REQUEST' });
      }, 500);
    } else {
      this.updateStatus('Waiting for Remote Guest...', false);
    }
  }

  private setupPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.channel?.postMessage({
          type: 'ICE_CANDIDATE',
          data: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.updateStatus('Connected (WebRTC Audio Live)', true);
        if (this.onRemoteStream) {
          this.onRemoteStream(this.remoteStream);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.updateStatus('Connected (WebRTC Audio Live)', true);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.updateStatus('Disconnected', false);
      }
    };

    this.peerConnection = pc;
    return pc;
  }

  public async setLocalStream(stream: MediaStream) {
    if (!this.peerConnection) {
      this.setupPeerConnection();
    }

    if (this.peerConnection && stream) {
      const senders = this.peerConnection.getSenders();
      stream.getTracks().forEach((track) => {
        const existingSender = senders.find((s) => s.track && s.track.kind === track.kind);
        if (existingSender) {
          existingSender.replaceTrack(track).catch((e) => console.warn('replaceTrack error:', e));
        } else {
          this.peerConnection?.addTrack(track, stream);
        }
      });
    }
  }

  public async replaceLocalTrack(newTrack: MediaStreamTrack): Promise<void> {
    if (!this.peerConnection) return;
    const senders = this.peerConnection.getSenders();
    const sender = senders.find((s) => s.track && s.track.kind === 'audio');
    if (sender) {
      await sender.replaceTrack(newTrack);
    } else {
      this.peerConnection.addTrack(newTrack);
    }
  }

  public async createOffer() {
    const pc = this.peerConnection || this.setupPeerConnection();
    try {
      const offer = await pc.createOffer();
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
        this.updateStatus('Connected (WebRTC Audio Live)', true);
      } catch (e) {
        console.error('Error handling WebRTC answer:', e);
      }
    }
  }

  public dispose() {
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
