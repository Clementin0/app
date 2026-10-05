import { describe, expect, it } from 'vitest';
import { PHYSICS, POWERUPS } from '../src/config/game.config.js';
import { Autopilot } from '../src/logic/Autopilot.js';
import { createRng } from '../src/logic/rng.js';
import { RunnerWorld } from '../src/logic/RunnerWorld.js';
import { DT, emptyWorld, makeWorld, run } from './helpers.js';

const height = (w) => w.groundY - w.player.y;

function maxHeightDuring(world, seconds) {
  let max = 0;
  run(world, seconds, (w) => (max = Math.max(max, height(w))));
  return max;
}

function spawn(world, item, dx = 200) {
  return world._addEntity(item, world.player.x + dx);
}

describe('RunnerWorld - movement and physics', () => {
  it('starts running on the ground', () => {
    const w = makeWorld();
    expect(w.state).toBe('running');
    expect(w.player.grounded).toBe(true);
    expect(height(w)).toBe(0);
  });

  it('a held jump reaches ~v^2/2g and lands back on the ground', () => {
    const w = emptyWorld();
    expect(w.pressJump()).toBe(true);
    const apex = (PHYSICS.jumpVelocity ** 2) / (2 * PHYSICS.gravity);
    expect(maxHeightDuring(w, 1.2)).toBeGreaterThan(apex * 0.93);
    expect(w.player.grounded).toBe(true);
    expect(height(w)).toBe(0);
  });

  it('a quick tap gives a shorter (but useful) jump than holding', () => {
    const tap = emptyWorld();
    tap.pressJump();
    tap.step(DT);
    tap.releaseJump();
    const tapApex = maxHeightDuring(tap, 1.2);

    const hold = emptyWorld();
    hold.pressJump();
    const holdApex = maxHeightDuring(hold, 1.2);

    expect(tapApex).toBeGreaterThan(100); // clears spikes and low blocks
    expect(tapApex).toBeLessThan(holdApex - 40);
  });

  it('allows exactly one extra jump in the air (double jump)', () => {
    const w = emptyWorld();
    const types = [];
    w.pressJump();
    run(w, 0.3);
    expect(w.pressJump()).toBe(true);
    expect(w.pressJump()).toBe(false); // no triple jump
    types.push(...w.drainEvents().map((e) => e.type));
    expect(types).toContain('jump');
    expect(types).toContain('doubleJump');
    const apex = maxHeightDuring(w, 1.5);
    expect(apex).toBeGreaterThan(300); // reaches the high gems
  });

  it('buffers a tap made just before landing', () => {
    const w = emptyWorld();
    w.pressJump();
    run(w, 0.25);
    w.pressJump(); // double jump
    // Fall until just above the ground, then tap with no jumps left.
    let guard = 0;
    while (!(w.player.vy > 0 && height(w) < 40) && guard++ < 300) w.step(DT);
    expect(w.pressJump()).toBe(false);
    w.drainEvents();
    run(w, 0.1);
    expect(w.drainEvents().some((e) => e.type === 'jump')).toBe(true);
  });

  it('lands on top of blocks and dies hitting their side', () => {
    const top = makeWorld();
    top.distanceToNext = Infinity;
    spawn(top, { type: 'block', dx: 0, w: 90, h: 80 }, 170);
    top.pressJump();
    run(top, 0.9);
    expect(top.state).toBe('running');

    const side = makeWorld();
    side.distanceToNext = Infinity;
    spawn(side, { type: 'block', dx: 0, w: 90, h: 130 }, 120);
    run(side, 1);
    expect(side.state).toBe('dead');
    expect(side.deathCause).toBe('block');
  });

  it('dies touching a spike or a saw', () => {
    for (const item of [{ type: 'spike', dx: 0, w: 56, h: 56 }, { type: 'saw', dx: 0, dy: 38, r: 34 }]) {
      const w = emptyWorld();
      spawn(w, item, 150);
      run(w, 1);
      expect(w.state).toBe('dead');
      expect(w.deathCause).toBe(item.type);
      expect(w.drainEvents().some((e) => e.type === 'death')).toBe(true);
    }
  });

  it('falls into a pit and dies', () => {
    const w = emptyWorld();
    w._cutGround(w.player.x + 60, 260);
    run(w, 2);
    expect(w.state).toBe('dead');
    expect(w.deathCause).toBe('fall');
  });

  it('stops simulating once dead', () => {
    const w = emptyWorld();
    w._die('test');
    const t = w.time;
    run(w, 1);
    expect(w.time).toBe(t);
    expect(w.pressJump()).toBe(false);
  });
});

describe('RunnerWorld - pickups and score', () => {
  it('collects coins and gems and adds their value to the score', () => {
    const w = emptyWorld();
    spawn(w, { type: 'coin', dx: 0, dy: 30 }, 100);
    spawn(w, { type: 'coin', dx: 60, dy: 30 }, 100);
    spawn(w, { type: 'gem', dx: 120, dy: 30 }, 100);
    run(w, 1);
    expect(w.score.coins).toBe(2);
    expect(w.score.gems).toBe(1);
    expect(w.score.score).toBe(w.score.meters + 2 * 10 + 50);
  });

  it('score grows with distance', () => {
    const w = emptyWorld();
    run(w, 2);
    const s1 = w.score.score;
    run(w, 2);
    expect(s1).toBeGreaterThan(0);
    expect(w.score.score).toBeGreaterThan(s1);
  });

  it('shield absorbs one hit then grants a short invulnerability', () => {
    const w = emptyWorld();
    spawn(w, { type: 'shield', dx: 0, dy: 40 }, 60);
    spawn(w, { type: 'spike', dx: 0, w: 56, h: 56 }, 400);
    run(w, 1.5);
    expect(w.state).toBe('running');
    expect(w.player.shield).toBe(false);
    const events = w.drainEvents().map((e) => e.type);
    expect(events).toContain('shield');
    expect(events).toContain('shieldBreak');
  });

  it('magnet pulls nearby coins', () => {
    const w = emptyWorld();
    spawn(w, { type: 'magnet', dx: 0, dy: 40 }, 40);
    run(w, 0.2);
    expect(w.player.magnet).toBeGreaterThan(POWERUPS.magnetDuration - 0.5);
    // Coin floating far above the player: only the magnet can collect it.
    spawn(w, { type: 'coin', dx: 0, dy: 230 }, 120);
    run(w, 1);
    expect(w.score.coins).toBe(1);
  });

  it('announces a new record once while running', () => {
    const w = new RunnerWorld({ width: 1280, height: 720, rng: createRng(1), best: 5 });
    w.distanceToNext = Infinity;
    run(w, 3);
    expect(w.drainEvents().filter((e) => e.type === 'newBest')).toHaveLength(1);
  });
});

describe('RunnerWorld - revive (rewarded ad)', () => {
  it('revives once: clears nearby hazards, restores ground, grants invulnerability', () => {
    const w = emptyWorld();
    spawn(w, { type: 'spike', dx: 0, w: 56, h: 56 }, 150);
    spawn(w, { type: 'spike', dx: 0, w: 56, h: 56 }, 500);
    run(w, 1);
    expect(w.state).toBe('dead');
    expect(w.canRevive).toBe(true);

    expect(w.revive()).toBe(true);
    expect(w.state).toBe('running');
    expect(w.entities.filter((e) => e.type === 'spike')).toHaveLength(0);
    expect(w.player.invulnerable).toBeGreaterThan(0);
    expect(w.drainEvents().some((e) => e.type === 'revive')).toBe(true);
    run(w, 1);
    expect(w.state).toBe('running');

    w._die('test');
    expect(w.canRevive).toBe(false);
    expect(w.revive()).toBe(false);
    expect(w.state).toBe('dead');
  });

  it('revives a player who fell into a pit back on solid ground', () => {
    const w = emptyWorld();
    w._cutGround(w.player.x + 60, 260);
    run(w, 2);
    expect(w.deathCause).toBe('fall');
    w.revive();
    expect(w.player.y).toBe(w.groundY);
    run(w, 2);
    expect(w.state).toBe('running');
  });

  it('keeps the score when reviving', () => {
    const w = emptyWorld();
    run(w, 2);
    w._die('test');
    const before = w.score.score;
    w.revive();
    expect(w.score.score).toBe(before);
  });

  it('does not revive a living player', () => {
    const w = emptyWorld();
    expect(w.revive()).toBe(false);
  });
});

describe('RunnerWorld - viewport and long runs', () => {
  it('keeps everything anchored to the ground when the viewport changes', () => {
    const w = makeWorld();
    run(w, 4);
    const rel = w.entities.map((e) => w.groundY - e.y);
    w.setViewport(1600, 900);
    expect(w.groundY).toBe(900 - 120);
    expect(w.entities.map((e) => w.groundY - e.y)).toEqual(rel);
    expect(height(w)).toBe(0);
  });

  it('runs 5 minutes of random input on many seeds without errors', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rng = createRng(seed * 977);
      const w = makeWorld({ seed });
      run(w, 300, (world) => {
        if (world.state === 'dead') {
          if (world.canRevive) world.revive();
          else world.reset();
        }
        if (rng.chance(0.03)) world.pressJump();
        if (rng.chance(0.05)) world.releaseJump();
        world.drainEvents();
      });
      expect(Number.isFinite(w.score.score)).toBe(true);
      expect(w.entities.length).toBeLessThan(200); // despawning works
      expect(w.segments.length).toBeLessThan(20);
    }
  });

  it('generated levels are beatable: the autopilot survives 3 minutes', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const w = makeWorld({ seed });
      const bot = new Autopilot(w);
      run(w, 180, () => bot.update());
      expect(w.state, `seed ${seed} died: ${w.deathCause}`).toBe('running');
      expect(w.level).toBeGreaterThanOrEqual(8);
      expect(w.score.coins).toBeGreaterThan(50);
    }
  });
});
