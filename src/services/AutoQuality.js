/**
 * Adaptive graphics quality. Fed with the real frame times of a run, it
 * reports when the device averages below `minFps` over a window, so the
 * game can step down one quality level. Pauses and app switches (huge
 * frame times) are ignored, and every change is followed by a new warm-up.
 */
export const QUALITY_ORDER = Object.freeze(['low', 'medium', 'high']);

export function lowerQuality(name) {
  const i = QUALITY_ORDER.indexOf(name);
  return i > 0 ? QUALITY_ORDER[i - 1] : null;
}

export class AutoQuality {
  constructor({ warmup = 2.5, window = 4, minFps = 42 } = {}) {
    this.warmup = warmup;
    this.window = window;
    this.minFps = minFps;
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.frames = 0;
    this.time = 0;
  }

  /** Feeds one frame (seconds). Returns true when the last window was too slow. */
  sample(dt) {
    if (!(dt > 0) || dt > 0.5) return false;
    this.elapsed += dt;
    if (this.elapsed < this.warmup) return false;
    this.frames += 1;
    this.time += dt;
    if (this.time < this.window) return false;
    const fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    if (fps >= this.minFps) return false;
    this.elapsed = 0; // give the new level its own warm-up
    return true;
  }
}
