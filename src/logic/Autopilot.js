import { spansOverlap } from './collision.js';

/**
 * Simple bot that plays the RunnerWorld. Used for the animated demo behind
 * the main menu and by the tests, to prove that generated levels are
 * beatable and that long sessions run without errors.
 */
export class Autopilot {
  constructor(world) {
    this.world = world;
    this.holding = false;
  }

  /** Nearest obstacle/pit edge in front of the player within `range` px. */
  _nextThreat(range) {
    const w = this.world;
    const box = w.playerBox();
    const front = box.x + box.w;
    let best = null;

    for (const e of w.entities) {
      if (e.dead) continue;
      let kind = null;
      if (e.type === 'spike' || e.type === 'block') kind = e.type;
      else if (e.type === 'saw') kind = w.groundY - e.y > 120 ? 'sawHigh' : 'sawLow';
      if (!kind) continue;
      const left = e.x - e.w / 2;
      const right = e.x + e.w / 2;
      if (right < box.x) continue;
      // Ignore the block we are standing on.
      if (e.type === 'block' && left <= front && Math.abs(w.player.y - (e.y - e.h / 2)) < 2) continue;
      const d = left - front;
      if (d > range) continue;
      if (!best || d < best.d) best = { kind, d, entity: e };
    }

    // Pit: first segment start after a hole.
    for (let i = 0; i < w.segments.length - 1; i++) {
      const end = w.segments[i].x + w.segments[i].w;
      const d = end - (box.x + box.w - w.cfg.WORLD.edgeForgiveness);
      if (end + 20 < box.x || d > range) continue;
      if (!best || d < best.d) best = { kind: 'pit', d };
    }
    return best;
  }

  _solidBelowSoon(lookPx) {
    const w = this.world;
    const box = w.playerBox();
    const span = [box.x, box.x + box.w + lookPx];
    const ground = w.segments.some((s) => spansOverlap(span[0] + 8, span[1] - 8, s.x, s.x + s.w));
    const spike = w.entities.some((e) => e.type === 'spike' && spansOverlap(span[0], span[1], e.x - e.w / 2, e.x + e.w / 2));
    return ground && !spike;
  }

  /** Distance at which to take off: enough time to climb above the obstacle. */
  _lead(threat) {
    const w = this.world;
    const { jumpVelocity: v, gravity: g } = w.cfg.PHYSICS;
    let height = 0;
    if (threat.kind === 'spike') height = 44;
    else if (threat.kind === 'sawLow') height = 72;
    else if (threat.kind === 'block') height = w.player.y - (threat.entity.y - threat.entity.h / 2) + 6;
    if (threat.kind === 'pit') return w.speed * 0.04;
    const climb = height > 0 ? (v - Math.sqrt(Math.max(0, v * v - 2 * g * height))) / g : 0;
    return w.speed * (climb + 0.03);
  }

  update() {
    const w = this.world;
    if (w.state !== 'running') return;
    const p = w.player;
    const speed = w.speed;
    const threat = this._nextThreat(speed * 0.6);

    if (p.grounded) {
      if (this.holding) {
        w.releaseJump();
        this.holding = false;
      }
      if (!threat || threat.kind === 'sawHigh') return;
      if (threat.d <= this._lead(threat)) {
        w.pressJump();
        this.holding = true;
      }
      return;
    }

    // Airborne: double jump to save a bad landing (pit or spikes below).
    if (p.jumpsUsed < w.cfg.PHYSICS.maxJumps && p.vy > 150 && w.groundY - p.y < 150 && !this._solidBelowSoon(speed * 0.12)) {
      w.pressJump();
      this.holding = true;
    }
  }
}
