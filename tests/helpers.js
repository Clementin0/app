import { RunnerWorld } from '../src/logic/RunnerWorld.js';
import { createRng } from '../src/logic/rng.js';

export const DT = 1 / 60;

export function makeWorld(opts = {}) {
  return new RunnerWorld({ width: 1280, height: 720, rng: createRng(opts.seed ?? 42), ...opts });
}

/** World with no obstacles spawning (for isolated physics tests). */
export function emptyWorld(opts = {}) {
  const w = makeWorld(opts);
  w.distanceToNext = Infinity;
  w.nextPowerupAt = Infinity;
  return w;
}

export function run(world, seconds, onFrame) {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    onFrame?.(world, i);
    world.step(DT);
  }
}

/** In-memory Storage implementation (localStorage API subset). */
export class MemoryStorage {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}
