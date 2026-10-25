// Procedural audio: a looping "hacker" ambient drone plus synthesised SFX, built
// with the Web Audio API so there are no audio files to ship or license. Volumes
// for music and SFX are independent and persisted in localStorage. Everything is
// guarded: if Web Audio is unavailable or blocked, the game runs silent.

const LS_MUSIC = 'zd.audio.music';
const LS_SFX = 'zd.audio.sfx';
const DEFAULT_MUSIC = 0.35;
const DEFAULT_SFX = 0.6;

function readVolume(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
  } catch {
    return fallback;
  }
}

function writeVolume(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* private mode: keep the in-memory value only */
  }
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicNodes: AudioNode[] = [];
  private blipTimer: ReturnType<typeof setInterval> | null = null;
  private musicOn = false;
  music = readVolume(LS_MUSIC, DEFAULT_MUSIC);
  sfx = readVolume(LS_SFX, DEFAULT_SFX);

  /** Create/resume the context on a user gesture (autoplay policy). */
  ensureStarted(): void {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      if (!this.ctx) {
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.music;
        this.musicGain.connect(this.master);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = this.sfx;
        this.sfxGain.connect(this.master);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      if (!this.musicOn) this.startMusic();
    } catch {
      /* audio unavailable: stay silent */
    }
  }

  private startMusic(): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    this.musicOn = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 6;
    filter.connect(this.musicGain);

    // Two detuned low oscillators = a slow, dark pad.
    for (const [freq, detune, type] of [
      [55, -5, 'sawtooth'],
      [55, 7, 'sine'],
      [82.4, 3, 'triangle'],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 0.12;
      osc.connect(g).connect(filter);
      osc.start();
      this.musicNodes.push(osc, g);
    }

    // Slow filter sweep for movement.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 240;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    this.musicNodes.push(lfo, lfoGain, filter);

    // Occasional soft "data" blips for the hacker feel.
    this.blipTimer = setInterval(() => {
      if (!this.musicOn || this.music <= 0) return;
      this.blip(880 + Math.floor(Math.random() * 6) * 120, 0.05);
    }, 2600);
  }

  private blip(freq: number, gain: number): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(g).connect(this.musicGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  private tone(freq: number, dur: number, type: OscillatorType, peak: number, slideTo?: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  playClick(): void {
    this.ensureStarted();
    this.tone(220, 0.07, 'square', 0.25);
  }

  playSuccess(): void {
    this.ensureStarted();
    this.tone(523, 0.12, 'triangle', 0.3);
    setTimeout(() => this.tone(784, 0.18, 'triangle', 0.3), 90);
  }

  playError(): void {
    this.ensureStarted();
    this.tone(160, 0.3, 'sawtooth', 0.3, 90);
  }

  setMusic(v: number): void {
    this.music = Math.max(0, Math.min(1, v));
    writeVolume(LS_MUSIC, this.music);
    if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(this.music, this.ctx.currentTime, 0.05);
  }

  setSfx(v: number): void {
    this.sfx = Math.max(0, Math.min(1, v));
    writeVolume(LS_SFX, this.sfx);
    if (this.sfxGain && this.ctx) this.sfxGain.gain.setTargetAtTime(this.sfx, this.ctx.currentTime, 0.05);
  }
}

export const audio = new AudioEngine();
