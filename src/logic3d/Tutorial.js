/**
 * First-run tutorial driven on top of a LaneWorld. Each step sends one
 * obstacle (or enemy) down the track; as it gets close, time slows to a
 * stop and the HUD shows the gesture to use. The right move resumes time.
 * Random rows are paused and the player cannot be hurt until it is over.
 *
 * The scene feeds it real frame times and world events, and multiplies the
 * world step by `timeScale`.
 */
export const TUTORIAL_STEPS = Object.freeze([
  // Wall in the player's lane: change lane (either side).
  { id: 'lane', hint: 'tutLane', gesture: 'horizontal', slowZ: 22, freezeZ: 10, minScale: 0, spawn: (w) => [{ type: 'wall', lane: w.player.lane, dz: 0 }] },
  // Barriers across the road: jump.
  { id: 'jump', hint: 'tutJump', gesture: 'up', slowZ: 16, freezeZ: 6.5, minScale: 0, spawn: () => [0, 1, 2].map((lane) => ({ type: 'barrier', lane, dz: 0 })) },
  // Laser beams across the road: slide.
  { id: 'slide', hint: 'tutSlide', gesture: 'down', slowZ: 16, freezeZ: 6.5, minScale: 0, spawn: () => [0, 1, 2].map((lane) => ({ type: 'beam', lane, dz: 0 })) },
  // A robot in the player's lane: shoot it down (time never fully stops, so shots fly).
  { id: 'shoot', hint: 'tutShoot', gesture: 'hold', slowZ: 36, freezeZ: 20, minScale: 0.15, spawn: (w) => [{ type: 'walker', lane: w.player.lane, dz: 0 }] },
]);

const SPAWN_Z = 46;
const GAP = 0.9; // seconds between steps

export class Tutorial {
  constructor(world) {
    this.world = world;
    this.index = 0;
    this.state = 'gap';
    this.timer = 1.4;
    this.timeScale = 1;
    this.prompting = false;
    this.finished = false;
    this.target = null;
    this.acted = false;
    this.events = [];
    world.spawnPaused = true;
    world.safe = true;
  }

  get step() {
    return TUTORIAL_STEPS[this.index] ?? null;
  }

  /** HUD prompt to show right now (null when none). */
  get hint() {
    return this.prompting ? this.step : null;
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** World events of the last frame (laneChange, jump, slide, shoot, kill, smash). */
  onEvent(e) {
    if (this.state !== 'approach' || !this.step) return;
    const id = this.step.id;
    // A slam (swipe down while airborne) also counts: with time stopped the
    // player may have jumped first and could never land to slide.
    if ((id === 'jump' && e.type === 'jump') || (id === 'slide' && (e.type === 'slide' || e.type === 'slam'))) {
      if (this.prompting) this._success();
    } else if (id === 'shoot') {
      if (e.type === 'shoot') this.acted = true;
      if (e.type === 'kill' && e.id === this.target?.id) this._success();
      else if (e.type === 'smash' && e.id === this.target?.id) this._retry();
    }
  }

  /** Advances with the real frame time; returns the world time scale. */
  update(dt) {
    if (this.finished) return 1;
    const w = this.world;
    if (this.state === 'gap') {
      this.timer -= dt;
      if (this.timer <= 0) this._spawn();
    } else if (this.state === 'approach') {
      const step = this.step;
      if (step.id === 'lane' && w.player.lane !== this.target.lane) {
        this._success();
      } else {
        const z = this.target.z - this.target.d / 2;
        this.prompting = z <= step.slowZ;
        // Shots in the air keep the robot step at full speed.
        const raw = (z - step.freezeZ) / (step.slowZ - step.freezeZ);
        this.timeScale = this.acted ? 1 : Math.max(step.minScale, Math.min(1, raw < 0.02 ? 0 : raw));
      }
    } else if (this.state === 'clear') {
      const t = this.target;
      if (t.dead || t.z + t.d / 2 < -2) {
        this.index += 1;
        if (this.index >= TUTORIAL_STEPS.length) {
          this.state = 'outro';
          this.timer = 1.6;
          this.events.push({ type: 'tutorialDone' });
        } else {
          this.state = 'gap';
          this.timer = GAP;
        }
      }
    } else if (this.state === 'outro') {
      this.timer -= dt;
      if (this.timer <= 0) this.finish();
    }
    return this.timeScale;
  }

  /** Ends (or skips) the tutorial and gives the run back to the spawner. */
  finish() {
    if (this.finished) return;
    this.finished = true;
    this.prompting = false;
    this.timeScale = 1;
    const w = this.world;
    w.safe = false;
    w.resumeSpawns();
  }

  _spawn() {
    const w = this.world;
    const items = this.step.spawn(w);
    const added = items.map((item) => w._addEntity(item, SPAWN_Z));
    // The middle element is the reference for rows across the road.
    this.target = added[Math.floor(added.length / 2)];
    this.acted = false;
    this.state = 'approach';
  }

  _success() {
    this.state = 'clear';
    this.prompting = false;
    this.timeScale = 1;
    this.events.push({ type: 'tutorialStep', id: this.step.id });
  }

  _retry() {
    this.prompting = false;
    this.timeScale = 1;
    this.state = 'gap';
    this.timer = GAP;
    this.events.push({ type: 'tutorialRetry', id: this.step.id });
  }
}
