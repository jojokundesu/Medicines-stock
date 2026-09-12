// Synthesized sound effects via Web Audio — no external assets needed.

type SfxName =
  | 'bell' | 'beep' | 'click' | 'coin' | 'note' | 'drawerOpen' | 'drawerClose'
  | 'printer' | 'success' | 'error' | 'hint' | 'step' | 'chime';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // pre-render 1s of white noise
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.4, when = 0, slideTo?: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol = 0.3, when = 0, filterFreq = 2000, type: BiquadFilterType = 'bandpass') {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  play(name: SfxName) {
    if (this.muted || !this.ctx) return;
    switch (name) {
      case 'bell': this.tone(880, 0.5, 'sine', 0.3); this.tone(1174, 0.6, 'sine', 0.25, 0.02); break;
      case 'beep': this.tone(1200, 0.08, 'square', 0.2); break;
      case 'click': this.tone(600, 0.05, 'square', 0.12); break;
      case 'coin': this.tone(2600, 0.06, 'triangle', 0.3); this.tone(3400, 0.09, 'triangle', 0.22, 0.02); break;
      case 'note': this.noise(0.12, 0.25, 0, 1200, 'bandpass'); break;
      case 'drawerOpen': this.noise(0.18, 0.3, 0, 700, 'lowpass'); this.tone(140, 0.12, 'sine', 0.25, 0.02); break;
      case 'drawerClose': this.noise(0.14, 0.3, 0, 500, 'lowpass'); this.tone(180, 0.1, 'sine', 0.2, 0.04, 90); break;
      case 'printer': this.noise(0.35, 0.25, 0, 3000, 'bandpass'); this.tone(200, 0.3, 'sawtooth', 0.08, 0.05); break;
      case 'success': this.tone(660, 0.12, 'sine', 0.3); this.tone(880, 0.18, 'sine', 0.3, 0.1); this.tone(1320, 0.25, 'sine', 0.25, 0.2); break;
      case 'error': this.tone(220, 0.25, 'sawtooth', 0.2); this.tone(180, 0.3, 'sawtooth', 0.2, 0.1); break;
      case 'hint': this.tone(520, 0.1, 'sine', 0.2); this.tone(780, 0.14, 'sine', 0.2, 0.09); break;
      case 'step': this.noise(0.05, 0.1, 0, 400, 'lowpass'); break;
      case 'chime': this.tone(1046, 0.5, 'sine', 0.3); this.tone(1318, 0.6, 'sine', 0.25, 0.06); break;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
  }
}

export const audio = new AudioEngine();
