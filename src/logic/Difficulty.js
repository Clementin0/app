import { PHYSICS, SPEED } from '../config/game.config.js';

/** Running speed (px/s) after `t` seconds: exponential ramp from start to max. */
export function speedAt(t, cfg = SPEED) {
  const time = Math.max(0, t);
  return cfg.max - (cfg.max - cfg.start) * Math.exp(-time / cfg.rampTime);
}

/** Difficulty level (0..maxLevel) after `t` seconds. */
export function levelAt(t, cfg = SPEED) {
  return Math.min(cfg.maxLevel, Math.floor(Math.max(0, t) / cfg.levelEvery));
}

/** Total airtime of a full single jump. */
export function jumpAirtime(physics = PHYSICS) {
  return (2 * physics.jumpVelocity) / physics.gravity;
}

/**
 * Free distance between two obstacle patterns. The minimum always leaves time
 * to land after a full jump plus a human reaction window, so every sequence
 * produced by the spawner is beatable.
 */
export function gapRange(speed, level, physics = PHYSICS) {
  const reaction = 0.28;
  const min = speed * (jumpAirtime(physics) * 0.9 + reaction);
  const slack = Math.max(160, 560 - level * 55);
  return { min, max: min + slack };
}

/** Widest pit that can be cleared with a single jump at this speed (with margin). */
export function maxPitWidth(speed, physics = PHYSICS) {
  return Math.min(360, jumpAirtime(physics) * speed * 0.62);
}
