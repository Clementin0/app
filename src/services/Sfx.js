/**
 * Procedural sound effects synthesized with the Web Audio API: no audio
 * files to ship or load. The AudioContext is created on the first user
 * gesture (autoplay policies).
 */

const SOUNDS = {
  click: [{ type: 'square', from: 660, to: 880, dur: 0.06, vol: 0.12 }],
  jump: [{ type: 'square', from: 320, to: 640, dur: 0.12, vol: 0.12 }],
  doubleJump: [
    { type: 'square', from: 480, to: 960, dur: 0.1, vol: 0.11 },
    { type: 'triangle', from: 960, to: 1280, dur: 0.08, vol: 0.08, delay: 0.05 },
  ],
  land: [{ type: 'triangle', from: 180, to: 90, dur: 0.07, vol: 0.12 }],
  coin: [
    { type: 'square', from: 988, to: 988, dur: 0.06, vol: 0.09 },
    { type: 'square', from: 1319, to: 1319, dur: 0.12, vol: 0.09, delay: 0.06 },
  ],
  gem: [
    { type: 'triangle', from: 1047, to: 1047, dur: 0.08, vol: 0.12 },
    { type: 'triangle', from: 1319, to: 1319, dur: 0.08, vol: 0.12, delay: 0.07 },
    { type: 'triangle', from: 1568, to: 1568, dur: 0.16, vol: 0.12, delay: 0.14 },
  ],
  powerup: [{ type: 'sawtooth', from: 300, to: 1200, dur: 0.35, vol: 0.08 }],
  shieldBreak: [
    { type: 'noise', dur: 0.18, vol: 0.18 },
    { type: 'triangle', from: 900, to: 200, dur: 0.25, vol: 0.12 },
  ],
  death: [
    { type: 'noise', dur: 0.35, vol: 0.25 },
    { type: 'sawtooth', from: 400, to: 60, dur: 0.5, vol: 0.14 },
  ],
  levelUp: [
    { type: 'square', from: 523, to: 523, dur: 0.08, vol: 0.08 },
    { type: 'square', from: 659, to: 659, dur: 0.08, vol: 0.08, delay: 0.08 },
    { type: 'square', from: 784, to: 784, dur: 0.16, vol: 0.08, delay: 0.16 },
  ],
  revive: [{ type: 'triangle', from: 200, to: 1000, dur: 0.5, vol: 0.14 }],
  tick: [{ type: 'square', from: 440, to: 440, dur: 0.08, vol: 0.08 }],
  go: [{ type: 'square', from: 880, to: 880, dur: 0.2, vol: 0.1 }],
  newBest: [
    { type: 'triangle', from: 784, to: 784, dur: 0.1, vol: 0.12 },
    { type: 'triangle', from: 1047, to: 1047, dur: 0.1, vol: 0.12, delay: 0.1 },
    { type: 'triangle', from: 1568, to: 1568, dur: 0.25, vol: 0.12, delay: 0.2 },
  ],
};

export class Sfx {
  constructor({ muted = false } = {}) {
    this.muted = muted;
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
  }

  /** Must be called from a user gesture at least once. */
  unlock() {
    try {
      if (!this.ctx) {
        const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.8;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch {
      this.ctx = null;
    }
  }

  suspend() {
    this.ctx?.suspend?.().catch(() => {});
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(muted) {
    this.muted = !!muted;
  }

  play(name) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const parts = SOUNDS[name];
    if (!parts) return;
    try {
      const now = this.ctx.currentTime;
      for (const part of parts) this._voice(part, now + (part.delay ?? 0));
    } catch {
      // Audio is optional: never let it break the game.
    }
  }

  _voice(part, t0) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(part.vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + part.dur);
    gain.connect(this.master);

    let src;
    if (part.type === 'noise') {
      src = ctx.createBufferSource();
      src.buffer = this._noise();
    } else {
      src = ctx.createOscillator();
      src.type = part.type;
      src.frequency.setValueAtTime(part.from, t0);
      if (part.to !== part.from) src.frequency.exponentialRampToValueAtTime(part.to, t0 + part.dur);
    }
    src.connect(gain);
    src.start(t0);
    src.stop(t0 + part.dur + 0.02);
  }

  _noise() {
    if (!this.noiseBuffer) {
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  }
}
