/**
 * Gameplay tuning. All distances are in game pixels, times in seconds.
 * The game uses a 1280x720 landscape base resolution (Phaser Scale.EXPAND
 * grows it to fill wider/taller screens without letterboxing).
 */

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const PHYSICS = Object.freeze({
  gravity: 2600,
  jumpVelocity: 1000, // apex ~192px
  doubleJumpVelocity: 900,
  /** Releasing the tap early multiplies the upward velocity by this factor. */
  jumpCutFactor: 0.45,
  maxFallSpeed: 1700,
  /** Grace time to jump after running off an edge. */
  coyoteTime: 0.09,
  /** A tap slightly before landing is remembered for this long. */
  jumpBuffer: 0.12,
  maxJumps: 2,
});

export const PLAYER = Object.freeze({
  size: 60, // sprite size
  hitboxWidth: 40,
  hitboxHeight: 48,
  /** Horizontal position as a fraction of the screen width (clamped). */
  xRatio: 0.2,
  minX: 170,
  maxX: 320,
});

export const WORLD = Object.freeze({
  /** Distance from the bottom of the screen to the running surface. */
  groundOffset: 120,
  pixelsPerMeter: 40,
  /** Falling this far below the ground surface is a death. */
  fallDeathDepth: 320,
  spawnMargin: 140,
  despawnMargin: 260,
  /** Ground texture tile width: trimming keeps the pattern continuous. */
  groundTile: 128,
  /** Pixels of tolerance when landing on a surface. */
  landTolerance: 6,
  /** Inset (each side) when checking if the player still has ground under the feet. */
  edgeForgiveness: 8,
  maxStep: 1 / 20,
});

export const SPEED = Object.freeze({
  start: 430,
  max: 1050,
  /** Time constant of the exponential ramp towards `max`. */
  rampTime: 80,
  /** A new difficulty level (more pattern types, "SPEED UP!") every N seconds. */
  levelEvery: 15,
  maxLevel: 8,
});

export const SCORING = Object.freeze({
  pointsPerMeter: 1,
  coinValue: 10,
  gemValue: 50,
});

export const POWERUPS = Object.freeze({
  magnetDuration: 8,
  magnetRadius: 280,
  magnetPull: 1500,
  /** Invulnerability after the shield absorbs a hit. */
  shieldGrace: 1.0,
  /** Invulnerability after a revive (rewarded ad). */
  reviveGrace: 2.5,
  /** Seconds between power-up spawns (random in range). */
  spawnEvery: [16, 28],
});

export const REVIVE = Object.freeze({
  /** Hazards closer than this (ahead of the player) are removed on revive. */
  clearAhead: 950,
  clearBehind: 400,
  countdown: 3,
});

export const GAME_CONFIG = Object.freeze({ PHYSICS, PLAYER, WORLD, SPEED, SCORING, POWERUPS, REVIVE });
