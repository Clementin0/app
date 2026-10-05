/**
 * Procedural synthwave soundtrack (Web Audio): bass, arpeggio with echo,
 * pad and drums, scheduled ahead of time with a lookahead timer. No audio
 * files. Uses the AudioContext owned by Sfx (created on a user gesture).
 */

const BPM = 112;
const STEP = 60 / BPM / 4; // a sixteenth note
const LOOKAHEAD = 0.15;

// Am - F - C - G, one bar each. MIDI note numbers.
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

export class Music {
  constructor(getContext, { enabled = true } = {}) {
    this.getContext = getContext;
    this.enabled = enabled;
    this.playing = false;
    this.intensity = 0; // 0 = menu (no drums), 1 = gameplay
    this.ducked = false;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this.out = null;
  }

  _setup() {
    const ctx = this.getContext();
    if (!ctx) return null;
    if (this.out && this.out.context === ctx) return ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(ctx.destination);

    // Echo bus for the arpeggio.
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.35;
    this.echo.connect(feedback).connect(this.echo);
    this.echo.connect(echoOut).connect(this.out);

    const len = Math.floor(ctx.sampleRate * 0.3);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  _targetVolume() {
    if (!this.enabled || !this.playing) return 0;
    return this.ducked ? 0.18 : 0.42;
  }

  _applyVolume(time = 0.4) {
    const ctx = this.getContext();
    if (!ctx || !this.out) return;
    const g = this.out.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(this._targetVolume(), ctx.currentTime + time);
  }

  /** Starts (or keeps) the loop. Safe to call repeatedly. */
  start(intensity = this.intensity) {
    this.intensity = intensity;
    this.playing = true;
    const ctx = this._setup();
    if (!ctx) return;
    if (!this.timer) {
      this.nextTime = ctx.currentTime + 0.05;
      this.timer = setInterval(() => this._schedule(), 30);
    }
    this._applyVolume();
  }

  stop() {
    this.playing = false;
    this._applyVolume(0.3);
    clearInterval(this.timer);
    this.timer = null;
  }

  setIntensity(intensity) {
    this.intensity = intensity;
  }

  /** Lower volume behind menus (pause, game over). */
  duck(on) {
    this.ducked = on;
    this._applyVolume(0.25);
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (this.enabled && this.playing) this.start();
    this._applyVolume(0.2);
  }

  _schedule() {
    const ctx = this.getContext();
    if (!ctx || ctx.state !== 'running' || !this.enabled) {
      if (ctx) this.nextTime = Math.max(this.nextTime, ctx.currentTime + 0.05);
      return;
    }
    // After a long suspension, do not try to catch up.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this._playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % 64;
      this.nextTime += STEP;
    }
  }

  _playStep(step, t) {
    const chord = CHORDS[Math.floor(step / 16)];
    const inBar = step % 16;

    // Bass on eighths, octave jump on the off-beats.
    if (inBar % 2 === 0) this._bass(hz(chord[0] - 24 + (inBar % 4 === 2 ? 12 : 0)), t);
    // Arpeggio on sixteenths.
    this._arp(hz(chord[ARP[inBar % 8]] + 12), t);
    // Pad at the start of each bar.
    if (inBar === 0) for (const n of chord) this._pad(hz(n), t);

    if (this.intensity > 0) {
      if (inBar % 4 === 0) this._kick(t);
      if (inBar === 4 || inBar === 12) this._snare(t);
      if (inBar % 4 === 2) this._hat(t);
    }
  }

  _env(t, peak, attack, decay) {
    const ctx = this.out.context;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  _osc(type, freq, t, dur, gain, filterFreq) {
    const ctx = this.out.context;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    let node = o;
    if (filterFreq) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      node = o.connect(f);
    }
    node.connect(gain);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  _bass(freq, t) {
    const g = this._env(t, 0.32, 0.01, STEP * 1.8);
    g.connect(this.out);
    this._osc('sawtooth', freq, t, STEP * 2, g, 520);
  }

  _arp(freq, t) {
    const g = this._env(t, 0.07, 0.005, STEP * 0.9);
    g.connect(this.out);
    g.connect(this.echo);
    this._osc('square', freq, t, STEP, g, 2600);
  }

  _pad(freq, t) {
    const bar = STEP * 16;
    const ctx = this.out.context;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + bar);
    g.connect(this.out);
    this._osc('sawtooth', freq, t, bar, g, 900);
    this._osc('triangle', freq * 1.005, t, bar, g, 900);
  }

  _kick(t) {
    const ctx = this.out.context;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = this._env(t, 0.55, 0.003, 0.22);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.3);
  }

  _noiseHit(t, type, freq, peak, decay) {
    const ctx = this.out.context;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this._env(t, peak, 0.002, decay);
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + decay + 0.05);
  }

  _snare(t) {
    this._noiseHit(t, 'bandpass', 1800, 0.22, 0.16);
  }

  _hat(t) {
    this._noiseHit(t, 'highpass', 7000, 0.07, 0.04);
  }
}
