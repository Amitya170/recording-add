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

  public setLanguage(lang: string) {
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  public getLanguage(): string {
    return this.recognition?.lang || 'en-US';
  }

  public setActiveSpeaker(speakerName: string, role: 'host' | 'guest') {
    this.activeSpeaker = speakerName;
    this.activeRole = role;
  }
}

export function formatAsSRT(items: TranscriptItem[]): string {
  const formatSrtTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},000`;
  };

  let srt = '';
  items.forEach((item, index) => {
    const startSec = item.seconds;
    const endSec = startSec + Math.max(3, Math.ceil(item.text.length / 15));
    srt += `${index + 1}\n`;
    srt += `${formatSrtTime(startSec)} --> ${formatSrtTime(endSec)}\n`;
    srt += `${item.speaker}: ${item.text}\n\n`;
  });
  return srt;
}

export function formatAsVTT(items: TranscriptItem[]): string {
  const formatVttTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.000`;
  };

  let vtt = 'WEBVTT - Podcast Craft Studio Captions\n\n';
  items.forEach((item, index) => {
    const startSec = item.seconds;
    const endSec = startSec + Math.max(3, Math.ceil(item.text.length / 15));
    vtt += `${index + 1}\n`;
    vtt += `${formatVttTime(startSec)} --> ${formatVttTime(endSec)}\n`;
    vtt += `<v ${item.speaker}>${item.text}\n\n`;
  });
  return vtt;
}

export function formatAsTXT(items: TranscriptItem[]): string {
  let txt = `===========================================================
PODCAST CRAFT STUDIO — LIVE SPEECH TRANSCRIPT REPORT
===========================================================
Generated: ${new Date().toLocaleString()}
Total Utterances: ${items.length}
===========================================================\n\n`;

  items.forEach((i) => {
    txt += `[${i.timestamp}] ${i.speaker.toUpperCase()} (${i.role.toUpperCase()}):\n${i.text}\n\n`;
  });
  txt += `===========================================================\nEND OF TRANSCRIPT REPORT\n===========================================================`;
  return txt;
}

