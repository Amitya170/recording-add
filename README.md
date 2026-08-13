# 🎙️ Podcast Craft Studio — Dual-Channel DAW & Live WebRTC Recording Console

> A studio-grade Web Audio API & WebRTC Dual-Channel Podcast Recording, Real-Time Processing, and DAW Editing Web Application.

---

## 🌟 Key Features

- **🎙️ Dual-Speaker Isolated Channel Recording**: Dual mono track isolation (Host on Channel 1 / Left, Guest on Channel 2 / Right).
- **📡 Real-Time WebRTC P2P Live Call Audio**: Bi-directional live call audio streaming between Host and remote Guest.
- **🎭 Dedicated Role Views**:
  - **Host Console**: Full DAW timeline editor, soundboard, recording controls, DSP rack, and session exports.
  - **Guest Console**: Clean full-width guest microphone panel with AI noise suppression and live captions.
- **🎛️ Live 4-Stage DSP Rack**: Real-time High-Pass Filter, 3-Band Parametric EQ, Dynamics Compressor, and Peak Limiter.
- **🎙️ Vocal Chain Presets**: *Broadcaster Warm Vocal*, *Radio Punch EQ*, *Aggressive Noise Gate*, and *Flat Reference*.
- **🎵 Studio Soundboard & SFX Player**: Web Audio synthesized audio triggers (*Intro Jingle*, *Applause*, *Laughter*, *Outro Stinger*).
- **📈 1-Click Broadcast Mastering**: Industry-standard **-16 LUFS** target normalization and peak limiting.
- **✂️ Multi-Track Waveform Timeline**: Non-destructive downsampled waveform rendering, clip cropping, fade in/out, reverse, and silence stripping.
- **💾 Combined Metadata & Multi-Track Stem Export**: Download single-file mixed stereo WAV, isolated speaker stems, combined session JSON, and text reports.

---

## 🚀 Quick Start

### 1. Installation

```bash
# Clone repository
git clone https://github.com/Amitya170/Audio-recording-.git
cd Audio-recording-

# Install dependencies
npm install

# Start local dev server
npm run dev
```

The application will launch at **`http://localhost:5173/`**.

---

## 🔑 Login Credentials

| Role | Email | Password | Access |
|------|-------|----------|--------|
| **Host** | `host@studio.local` | `host123` | Podcast Recording DAW Console & Guest Invites |
| **Admin** | `admin@studio.local` | `admin123` | System Analytics, Storage Stats & Combined Exports |

---

## 🛠️ Built With

- **Core**: React 19, TypeScript, Vite
- **Audio Engine**: Web Audio API (`AudioContext`, `BiquadFilterNode`, `DynamicsCompressorNode`, `AnalyserNode`)
- **P2P Live Call**: WebRTC (`RTCPeerConnection`, `BroadcastChannel` signaling)
- **Styling**: Vanilla CSS3 (Custom Glassmorphism DAW Theme)
- **Storage**: IndexedDB (`CloudAudioStore`) & LocalStorage

---

## 📄 License

MIT License © 2026 Amit
