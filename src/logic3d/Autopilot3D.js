import { laneX } from '../config/game3d.config.js';

const TARGETS = new Set(['walker', 'crate', 'drone']);

/**
 * Bot that plays a LaneWorld: picks the safest lane, jumps barriers,
 * slides under beams and plasma, and shoots what is in front of it.
 * Drives the menu's demo run and proves in tests that levels are beatable.
 */
export class Autopilot3D {
  constructor(world) {
    this.world = world;
    this.decisionCooldown = 0;
  }

  _inLane(e, lane, slack = 0.9) {
    return Math.abs(e.x - laneX(lane)) < slack;
  }

  _killTime(e) {
    const w = this.world.weaponStats;
    return (e.hp / w.damage) * w.interval + 0.15;
  }

  /** Higher is better. */
  _laneScore(lane, horizon) {
    const w = this.world;
    const p = w.player;
    let score = -Math.abs(lane - p.lane) * 4;
    for (const e of w.entities) {
      if (e.dead || !this._inLane(e, lane)) continue;
      const front = e.z - e.d / 2;
      const back = e.z + e.d / 2;
      if (back < -0.6 || front > horizon) continue;
      const d = Math.max(0.1, front);
      switch (e.type) {
        case 'wall':
          // Close walls dominate: the nearest one decides.
          score -= d < w.speed * 0.7 + 3 ? 5000 : 50 + 2000 / (d + 1);
          break;
        case 'platform':
          if (p.y >= e.y + e.h - 0.3 && lane === p.lane) score += 5;
          else score -= front < 3 ? 5000 : 25;
          break;
        case 'barrier':
        case 'beam':
          score -= 12;
          break;
        case 'walker':
        case 'crate': {
          const arrive = d / (w.speed + (e.type === 'walker' ? 4 : 0));
          // Hunt what can be shot down in time (points + loot); otherwise it
          // costs a heart, which is still far better than a wall.
          score += this._killTime(e) < arrive * 0.7 ? 8 : -120;
          break;
        }
        case 'drone':
          score -= 30;
          break;
        case 'coin':
          score += 3;
          break;
        case 'gem':
          score += 10;
          break;
        default:
          if (e.kind === 'pickup') score += 25;
      }
    }
    for (const s of w.eshots) {
      if (Math.abs(s.x - laneX(lane)) < 0.9 && s.z < 18 && s.z > -0.5) score -= 120;
    }
    return score;
  }

  update(dt = 1 / 60) {
    const w = this.world;
    if (w.state !== 'running') return;
    const p = w.player;
    const horizon = w.speed * 1.1 + 8;
    this.decisionCooldown = Math.max(0, this.decisionCooldown - dt);

    // 1. Lane choice: head towards the best lane, one lane at a time,
    //    as long as the next lane is not blocked right in front of us.
    if (this.decisionCooldown === 0 && Math.abs(p.x - laneX(p.lane)) < 0.15) {
      const scores = [0, 1, 2].map((lane) => this._laneScore(lane, horizon));
      let best = p.lane;
      for (let lane = 0; lane < 3; lane++) if (scores[lane] > scores[best] + 8) best = lane;
      if (best !== p.lane) {
        const dir = Math.sign(best - p.lane);
        const next = p.lane + dir;
        const hard = (e) => e.type === 'wall' || e.type === 'platform';
        const ahead = (e, lane, dist) => !e.dead && e.kind !== 'pickup' && this._inLane(e, lane) && e.z + e.d / 2 > -0.6 && e.z - e.d / 2 < dist;
        // Our own lane walled off soon: anything else (jump, slide, a hit) is better.
        const trapped = w.entities.some((e) => hard(e) && ahead(e, p.lane, w.speed * 0.6) && p.y < e.y + e.h - 0.2);
        const blockedNow = w.entities.some((e) => {
          if (!ahead(e, next, w.speed * 0.35)) return false;
          if (hard(e)) return e.z - e.d / 2 < w.speed * 0.2 && p.y < e.y + e.h - 0.2;
          // No time to jump / slide / shoot after switching into it.
          return !trapped && p.y < e.y + e.h;
        });
        if (!blockedNow) {
          if (dir < 0) w.moveLeft();
          else w.moveRight();
          this.decisionCooldown = 0.1;
        }
      }
    }

    // 2. Jump / slide for what is right ahead in the current lane.
    let nearest = null;
    for (const e of w.entities) {
      if (e.dead || e.kind === 'pickup' || !this._inLane(e, p.lane, 1.0)) continue;
      const front = e.z - e.d / 2 - 0.45;
      if (e.z + e.d / 2 < -0.45) continue;
      if (!nearest || front < nearest.front) nearest = { e, front };
    }
    if (nearest) {
      const { e, front } = nearest;
      if (e.type === 'barrier' && p.grounded && front < w.speed * 0.15 + 0.4) w.jump();
      else if (e.type === 'beam' && front < w.speed * 0.2 + 0.6) w.slide();
      else if (e.type === 'platform' && p.y < e.y + e.h - 0.2 && p.grounded && front < w.speed * 0.17 + 0.5 && front > 0) w.jump();
    }
    for (const s of w.eshots) {
      if (Math.abs(s.x - p.x) < 0.8 && s.z > 0 && s.z < 7 && p.grounded && p.slide <= 0.1) w.slide();
    }

    // 3. Shoot whatever is in front of us.
    let target = false;
    for (const e of w.entities) {
      if (!e.dead && TARGETS.has(e.type) && e.z > 0 && e.z < 60 && Math.abs(e.x - p.x) < e.w / 2 + 0.3) target = true;
    }
    if (w.boss && !w.boss.leaving && Math.abs(w.boss.x - p.x) < w.boss.w / 2) target = true;
    w.setFiring(target);
  }
}
