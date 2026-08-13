/**
 * SpeechToTextEngine — Real-Time Live Speech-to-Text & Closed Captioning Service.
 * Leverages Web Speech API (webkitSpeechRecognition) to stream continuous transcripts
 * with Host vs Guest speaker tags and timestamps.
 */

export interface TranscriptItem {
  id: string;
  speaker: string; // "Host Speaker" or "Guest Speaker"
  role: 'host' | 'guest';
  timestamp: string;
  seconds: number;
  text: string;
}

export class SpeechToTextEngine {
  private recognition: any = null;
  private isListening: boolean = false;
  private activeSpeaker: string = 'Host Speaker';
  private activeRole: 'host' | 'guest' = 'host';
  private sessionStartTime: number = Date.now();

  public onTranscript?: (item: TranscriptItem) => void;
  public onError?: (err: string) => void;

  constructor() {
    const SpeechClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechClass) {
      this.recognition = new SpeechClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            const text = event.results[i][0].transcript.trim();
            if (text) {
              const elapsedSec = Math.floor((Date.now() - this.sessionStartTime) / 1000);
              const m = Math.floor(elapsedSec / 60);
              const s = elapsedSec % 60;
              const formattedTime = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

              const item: TranscriptItem = {
                id: 'tr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 4),
                speaker: this.activeSpeaker,
                role: this.activeRole,
                timestamp: formattedTime,
                seconds: elapsedSec,
                text,
              };

              if (this.onTranscript) {
                this.onTranscript(item);
              }
            }
          }
        }
      };

      this.recognition.onerror = (e: any) => {
        if (this.onError) this.onError(e.error);
      };
    }
  }

  public isSupported(): boolean {
    return !!this.recognition;
  }

  public start(speakerName: string = 'Host Speaker', role: 'host' | 'guest' = 'host') {
    this.activeSpeaker = speakerName;
    this.activeRole = role;
    this.sessionStartTime = Date.now();

    if (this.recognition && !this.isListening) {
      try {
        this.recognition.start();
        this.isListening = true;
      } catch (e) {
        console.error('Speech recognition start error:', e);
      }
    }
  }

  public stop() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
        this.isListening = false;
      } catch (e) {
        console.error('Speech recognition stop error:', e);
      }
    }
  }

  public setActiveSpeaker(speakerName: string, role: 'host' | 'guest') {
    this.activeSpeaker = speakerName;
    this.activeRole = role;
  }
}
