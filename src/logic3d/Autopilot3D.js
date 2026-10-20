import { laneX } from '../config/game3d.config.js';

const TARGETS = new Set(['walker', 'crate', 'drone', 'mine', 'charger', 'turret', 'bomber', 'sniper', 'guard', 'car']);
const JUMP_OVER = new Set(['barrier', 'mine', 'gap', 'slider']);

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
    if (this.world.modifiers.noShoot) return Infinity;
    const w = this.world.weaponStats;
    return ((e.hp + (e.shieldHp > 0 ? e.shieldHp : 0)) / w.damage) * w.interval + 0.15;
  }

  /** Is a laser fence on at any moment while we would be going through it? */
  _fenceOnWhilePassing(e, front) {
    const w = this.world;
    const { on, off } = w.cfg.OBSTACLES.fence;
    const t0 = w.time + Math.max(0, front - 0.45) / w.speed;
    const t1 = w.time + (front + e.d + 0.45) / w.speed;
    for (let t = t0; t <= t1 + 1e-6; t += 0.02) if ((t + e.phase) % (on + off) < on) return true;
    return false;
  }

  /** A pad still ahead that we can reach in this lane (not too late to switch into it), or one we are on. */
  _padReachable(e, lane) {
    const w = this.world;
    if (e.used) return false;
    return lane === w.player.lane ? e.z + e.d / 2 > 0.2 : e.z - e.d / 2 > w.speed * 0.25;
  }

  /** Airborne: will we still be above `top` from `front` to `back` meters ahead? */
  _clears(front, back, top) {
    const w = this.world;
    const p = w.player;
    if (p.grounded) return false;
    const g = w.cfg.PLAYER.gravity * (w.lowGravity || p.floaty ? w.cfg.EVENTS.lowGravity.gravity : 1);
    const yAt = (d) => {
      const t = Math.max(0, d) / w.speed;
      return p.y + p.vy * t - (g * t * t) / 2;
    };
    return Math.min(yAt(front - 0.45), yAt(back + 0.45)) > top + 0.1;
  }

  /** Higher is better. */
  _laneScore(lane, horizon) {
    const w = this.world;
    const p = w.player;
    let score = -Math.abs(lane - p.lane) * 4;
    // Turbo smashes through everything: while it lasts, and after a pad we can take.
    const safe = [];
    if (p.turbo > 0 && lane === p.lane) safe.push([-Infinity, (p.turbo + 0.5) * w.speed]);
    for (const e of w.entities) {
      if (e.type === 'turbo' && this._inLane(e, lane) && this._padReachable(e, lane)) safe.push([e.z, e.z + 45]);
    }
    for (const e of w.entities) {
      if (e.dead || !this._inLane(e, lane)) continue;
      const front = e.z - e.d / 2;
      const back = e.z + e.d / 2;
      if (back < -0.6 || (front > horizon && e.type !== 'car')) continue;
      const d = Math.max(0.1, front);
      if (e.type === 'car') {
        // Cars rush in: look further ahead for them.
        const arrive = d / (w.speed + w.cfg.ENEMIES.car.speed);
        if (front < (w.speed + w.cfg.ENEMIES.car.speed) * 1.4) score += this._killTime(e) < arrive * 0.6 ? 5 : -700;
        continue;
      }
      if (e.kind !== 'pickup' && e.kind !== 'pad' && safe.some(([a, b]) => e.z > a && e.z < b)) {
        score += 4; // smash it for points
        continue;
      }
      switch (e.type) {
        case 'turbo':
          if (this._padReachable(e, lane)) score += 30;
          break;
        case 'ramp':
          if (this._padReachable(e, lane)) score += 20; // sky coins
          break;
        case 'wall':
          // A ramp right before it (or the flight it gave) takes us over; otherwise close walls dominate.
          if (
            (lane === p.lane && this._clears(front, back, e.y + e.h)) ||
            w.entities.some((r) => r.type === 'ramp' && this._inLane(r, lane) && r.z < e.z && this._padReachable(r, lane))
          ) {
            score += 6;
            break;
          }
          score -= d < w.speed * 0.7 + 3 ? 5000 : 50 + 2000 / (d + 1);
          break;
        case 'platform':
          if (p.y >= e.y + e.h - 0.3 && lane === p.lane) score += 5;
          else score -= front < 3 ? 5000 : 25;
          break;
        case 'barrier':
        case 'beam':
        case 'gap':
        case 'slider':
          score -= 12;
          break;
        case 'meteor':
          // It lands where we will be: never stay under a marker.
          score -= 900;
          break;
        case 'fence':
          score += this._fenceOnWhilePassing(e, front) ? -300 : 2;
          break;
        case 'sniper':
          score -= 10;
          break;
        case 'guard': {
          const arrive = d / (w.speed + w.cfg.ENEMIES.guard.walk);
          score += this._killTime(e) < arrive * 0.7 ? 6 : -160;
          break;
        }
        case 'charger':
          if (e.state === 'charge') {
            score -= 600;
            break;
          }
        // falls through: shoot it before it charges
        case 'walker':
        case 'crate':
        case 'mine':
        case 'turret': {
          const arrive = d / (w.speed + (e.type === 'walker' ? 4 : 0));
          // Hunt what can be shot down in time (points + loot); otherwise it
          // costs a heart, which is still far better than a wall.
          score += this._killTime(e) < arrive * 0.7 ? 8 : -120;
          break;
        }
        case 'drone':
        case 'bomber':
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
    // A sniper's sight is on this lane: it will fire down it (from far away, from any lane).
    for (const e of w.entities) if (e.type === 'sniper' && !e.dead && e.state === 'aim' && e.aimLane === lane) score -= 900;
    for (const s of w.eshots) {
      // Heavy plasma cannot be shot down or slid under: get out of its lane.
      if (Math.abs(s.x - laneX(lane)) < 0.9 && s.z < (s.heavy ? 26 : 18) && s.z > -0.5) score -= s.heavy ? 700 : 120;
    }
    return score;
  }

  update(dt = 1 / 60) {
    const w = this.world;
    if (w.state !== 'running') return;
    // Perk after a boss: take the first one offered.
    if (w.perkOffer) w.choosePerk(w.perkOffer[0]);
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
        const ahead = (e, lane, dist) => !e.dead && e.kind !== 'pickup' && e.kind !== 'pad' && this._inLane(e, lane) && e.z + e.d / 2 > -0.6 && e.z - e.d / 2 < dist;
        // Our own lane walled off soon: anything else (jump, slide, a hit) is better.
        const trapped = w.entities.some((e) => hard(e) && ahead(e, p.lane, w.speed * 0.6) && p.y < e.y + e.h - 0.2);
        const blockedNow = w.entities.some((e) => {
          if (e.type === 'meteor') return !e.dead && this._inLane(e, next) && e.fuse < 0.6;
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
      if (e.dead || e.kind === 'pickup' || e.kind === 'hazard' || e.kind === 'pad' || !this._inLane(e, p.lane, 1.0)) continue;
      const front = e.z - e.d / 2 - 0.45;
      if (e.z + e.d / 2 < -0.45) continue;
      if (!nearest || front < nearest.front) nearest = { e, front };
    }
    if (nearest && p.jetpack <= 0 && p.turbo <= 0) {
      const { e, front } = nearest;
      // A long (ramp, low gravity) flight coming down onto something: slam
      // down before it, there is time to jump or slide once landed.
      const back = e.z + e.d / 2;
      if (!p.grounded && p.vy < 0 && front > 1.5 && front < w.speed * 0.9 && !this._clears(front + 0.45, back, e.y + e.h) && e.type !== 'wall') w.slide();
      // Barriers, holes, sliders and mines that survived the shots are jumped.
      if (JUMP_OVER.has(e.type) && p.grounded && front < w.speed * 0.15 + 0.4) w.jump();
      else if (e.type === 'beam' && front < w.speed * 0.2 + 0.6) w.slide();
      else if (e.type === 'platform' && p.y < e.y + e.h - 0.2 && p.grounded && front < w.speed * 0.17 + 0.5 && front > 0) w.jump();
    }
    // Sliders sweep the whole road: jump any that would be on us when it arrives.
    for (const e of w.entities) {
      if (e.dead || e.type !== 'slider' || !p.grounded || p.jetpack > 0) continue;
      const front = e.z - e.d / 2 - 0.45;
      if (front < 0 || front > w.speed * 0.15 + 0.6) continue;
      const xAt = Math.sin(e.phase + ((front / w.speed) * Math.PI * 2) / e.period) * w.cfg.LANES.width;
      if (Math.abs(xAt - p.x) < e.w / 2 + 1.2) w.jump();
    }
    for (const s of w.eshots) {
      if (!s.heavy && Math.abs(s.x - p.x) < 0.8 && s.z > 0 && s.z < 7 && p.grounded && p.slide <= 0.1) w.slide();
    }
    // Boss waves: jump the quake, slide under the laser, just before they arrive.
    for (const wv of w.waves ?? []) {
      if (wv.charge > 0 || wv.hit || wv.z < 0) continue;
      const arrive = (wv.z - 0.45) / wv.speed;
      if (wv.kind === 'quake' && p.grounded && arrive < 0.16) w.jump();
      else if (wv.kind === 'laser' && arrive < 0.22 && p.slide <= 0.15) w.slide();
    }

    // Overdrive when it pays: a boss, or a crowd ahead.
    if (p.od >= 1 && p.overdrive <= 0) {
      const crowd = w.entities.filter((e) => !e.dead && e.kind === 'enemy' && e.z > 0 && e.z < 45).length;
      if (w.boss || crowd >= 3) w.activateOverdrive();
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
