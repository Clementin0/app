import { describe, expect, it } from 'vitest';
import { GAME3D } from '../src/config/game3d.config.js';
import { createRng } from '../src/logic/rng.js';
import { Autopilot3D } from '../src/logic3d/Autopilot3D.js';
import { LaneSpawner, PATTERNS3D } from '../src/logic3d/LaneSpawner.js';
import { LaneWorld } from '../src/logic3d/LaneWorld.js';

const DT = 1 / 60;
const { TURBO, ROCKETS, EVENTS, PLAYER } = GAME3D;

function quietWorld(opts = {}) {
  const w = new LaneWorld({ rng: createRng(opts.seed ?? 3), ...opts });
  w.distanceToNext = Infinity;
  w.nextPowerupAt = Infinity;
  w.entities = [];
  return w;
}
function run(w, seconds, each) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    each?.(w, i);
    w.step(DT);
  }
}
const place = (w, item, z) => w._addEntity({ dz: 0, lane: 1, ...item }, z);
const events = (w, type) => w.drainEvents().filter((e) => e.type === type);
/** Places a spawner pattern's items at z0, as the world does. */
function placePattern(w, key, z0, extra = {}) {
  const pattern = PATTERNS3D.find((p) => p.key === key);
  const built = pattern.build({ rng: w.courseRng, speed: w.speed, level: 5, drones: 0, lowGravity: false, ...extra });
  for (const item of built.items) w._addEntity(item, z0);
  return built;
}

describe('v4 turbo pads', () => {
  it('a pad gives a burst of speed that smashes walls, and a grace when it ends', () => {
    const w = quietWorld();
    place(w, { type: 'turbo' }, 6);
    const wall = place(w, { type: 'wall' }, 30);
    const base = w._speedAt(w.time);
    run(w, 0.5);
    expect(w.player.turbo).toBeGreaterThan(0);
    expect(events(w, 'turbo')).toHaveLength(1);
    expect(w.speed).toBeGreaterThan(base * 1.5);
    run(w, 1.2);
    expect(w.state).toBe('running');
    expect(wall.dead).toBe(true);
    expect(w.stats.smashed).toBe(1);
    expect(w.stats.turbos).toBe(1);
    run(w, TURBO.duration, (world) => {
      if (world.drainEvents().some((e) => e.type === 'turboEnd')) expect(world.player.invulnerable).toBeGreaterThan(TURBO.grace * 0.9);
    });
    expect(w.player.turbo).toBe(0);
    run(w, 2);
    expect(w.speed).toBeCloseTo(w._speedAt(w.time), 5);
    expect(w.player.turboK).toBe(0);
  });

  it('turbo skims over holes, kills enemies, ignores plasma; jumping over a pad misses it', () => {
    const w = quietWorld();
    w.player.turbo = 2;
    place(w, { type: 'gap' }, 8);
    const walker = place(w, { type: 'walker' }, 14);
    w.eshots.push({ id: 999, x: w.player.x, y: 1.25, z: 3, r: 0.32 });
    run(w, 1);
    expect(w.state).toBe('running');
    expect(w.player.hp).toBe(w.maxHp);
    expect(walker.killed).toBe(true);
    expect(w.stats.kills).toBe(1);

    const v = quietWorld();
    const pad = place(v, { type: 'turbo' }, 3);
    v.jump();
    run(v, 0.4);
    expect(pad.used).toBe(false);
    expect(v.player.turbo).toBe(0);
  });

  it('the turbo strip: through it on the pad, or around it in another lane', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = quietWorld({ seed });
      const turboLane = () => w.entities.find((e) => e.type === 'turbo').lane;
      placePattern(w, 'turboStrip', 20);
      const lane = turboLane();
      w.player.lane = lane;
      w.player.x = w.entities[0].x;
      run(w, 4);
      expect(w.state).toBe('running');
      expect(w.stats.smashed).toBeGreaterThanOrEqual(2);
      expect(w.score.coins).toBeGreaterThan(5);
    }
    // Without the pad, the strip's lane is walled.
    const w = quietWorld({ seed: 7 });
    placePattern(w, 'turboStrip', 20);
    const pad = w.entities.find((e) => e.type === 'turbo');
    const walls = w.entities.filter((e) => e.type === 'wall');
    expect(walls.every((e) => e.lane === pad.lane)).toBe(true);
  });
});

describe('v4 ramps', () => {
  it('a ramp lifts the runner up its slope and launches them over a wall', () => {
    for (const speed of [15, 22, 30, 34]) {
      const w = quietWorld();
      w._speedAt = () => speed;
      w.speed = speed;
      const built = placePattern(w, 'rampJump', 12);
      const ramp = w.entities.find((e) => e.type === 'ramp');
      w.player.lane = ramp.lane;
      w.player.x = ramp.x;
      let maxY = 0;
      run(w, 2.5, (world) => (maxY = Math.max(maxY, world.player.y)));
      expect(w.state, `speed ${speed}`).toBe('running');
      expect(w.stats.ramps).toBe(1);
      expect(maxY).toBeGreaterThan(GAME3D.OBSTACLES.wall.h);
      // The sky coins follow the flight.
      expect(w.score.coins, `speed ${speed}`).toBeGreaterThanOrEqual(7);
      expect(built.length).toBeGreaterThan(speed * 0.5);
    }
  });

  it('the ramp launch is softer in low gravity, still clearing the wall', () => {
    const w = quietWorld();
    w._startEvent('lowGravity');
    w.event.duration = 1e9;
    placePattern(w, 'rampJump', 12, { lowGravity: true });
    const ramp = w.entities.find((e) => e.type === 'ramp');
    w.player.lane = ramp.lane;
    w.player.x = ramp.x;
    run(w, 3);
    expect(w.state).toBe('running');
    expect(w.score.coins).toBeGreaterThanOrEqual(7);
  });

  it('shots fly over pads and ramps', () => {
    const w = quietWorld();
    place(w, { type: 'ramp' }, 8);
    place(w, { type: 'turbo' }, 12);
    const crate = place(w, { type: 'crate' }, 25);
    w.setFiring(true);
    run(w, 1);
    expect(crate.dead).toBe(true);
  });
});

describe('v4 homing rockets', () => {
  it('rockets home in on enemies in other lanes, with a blast', () => {
    const w = quietWorld();
    w.player.rockets = ROCKETS.duration;
    const a = place(w, { type: 'walker', lane: 0 }, 30);
    const b = place(w, { type: 'walker', lane: 0 }, 31.5);
    w.drainEvents();
    let rockets = 0;
    let blasts = 0;
    run(w, 1.5, (world) => {
      for (const e of world.drainEvents()) {
        if (e.type === 'rocket') rockets += 1;
        if (e.type === 'explosion' && e.rocket) blasts += 1;
      }
    });
    expect(rockets).toBeGreaterThanOrEqual(1);
    expect(blasts).toBeGreaterThanOrEqual(1);
    expect(a.dead && b.dead).toBe(true);
  });

  it('no target, no rocket; the power-up runs out', () => {
    const w = quietWorld();
    place(w, { type: 'rockets', y: 0.5 }, 1);
    run(w, 0.2);
    expect(w.player.rockets).toBeGreaterThan(0);
    w.drainEvents();
    run(w, 2);
    expect(events(w, 'rocket')).toHaveLength(0);
    run(w, ROCKETS.duration);
    expect(w.player.rockets).toBe(0);
  });

  it('rockets also chase the boss', () => {
    const w = quietWorld();
    w._spawnBoss();
    w.boss.z = 34;
    w.boss.attackTimer = 1e9;
    w.player.rockets = 3;
    const hp = w.boss.hp;
    run(w, 2.5);
    expect(w.boss.hp).toBeLessThanOrEqual(hp - ROCKETS.damage * 2);
  });
});

describe('v4 run events', () => {
  const zoneWorld = (zone, seed = 4) => {
    const w = new LaneWorld({ rng: createRng(seed) });
    w.zone.index = zone;
    w.lastEvent = null;
    return w;
  };

  it('storms only in the desert, ice and city zones; low gravity only in abyss and orbit', () => {
    const seen = {};
    for (const zone of [1, 2, 3, 4, 5, 6]) {
      seen[zone] = new Set();
      for (let i = 0; i < 80; i++) {
        const w = zoneWorld(zone, i);
        seen[zone].add(w._pickEvent());
      }
    }
    expect(seen[1].has('storm')).toBe(true);
    expect(seen[2].has('storm')).toBe(true);
    expect(seen[6].has('storm')).toBe(true); // the city again
    expect(seen[3].has('storm') || seen[3].has('lowGravity')).toBe(false);
    expect(seen[4].has('lowGravity')).toBe(true);
    expect(seen[5].has('lowGravity')).toBe(true);
    for (const z of [1, 2, 3, 6]) expect(seen[z].has('lowGravity')).toBe(false);
  });

  it('storm: double score and rows further apart', () => {
    const scoreAfter = (event) => {
      const w = quietWorld();
      if (event) {
        w._startEvent(event);
        w.event.duration = 1e9;
      }
      run(w, 3);
      return w.score.score;
    };
    expect(scoreAfter('storm')).toBeCloseTo(scoreAfter(null) * EVENTS.storm.score, -1);

    const spacing = (event) => {
      const w = new LaneWorld({ rng: createRng(5), courseSeed: 77 });
      w.player.invulnerable = 1e9;
      if (event) {
        w._startEvent(event);
        w.event.duration = 1e9;
      }
      run(w, 40, (world) => (world.player.invulnerable = 1e9));
      return w.distance / w.spawner.count;
    };
    expect(spacing('storm')).toBeGreaterThan(spacing(null) * 1.05);
  });

  it('low gravity: higher, longer jumps, still floaty if the event ends mid-air', () => {
    const flight = (low, endMidAir = false) => {
      const w = quietWorld();
      if (low) w._startEvent('lowGravity');
      w.jump();
      let maxY = 0;
      let t = 0;
      for (let i = 0; i < 400; i++) {
        if (endMidAir && i === 5) w._endEvent();
        w.step(DT);
        t += DT;
        maxY = Math.max(maxY, w.player.y);
        if (w.player.grounded) break;
      }
      return { maxY, t };
    };
    const normal = flight(false);
    const low = flight(true);
    const ended = flight(true, true);
    expect(low.maxY).toBeGreaterThan(normal.maxY * 1.15);
    expect(low.t).toBeGreaterThan(normal.t * 1.5);
    expect(ended.t).toBeGreaterThan(normal.t * 1.4);
    // Back to normal once landed.
    expect(EVENTS.lowGravity.jump * PLAYER.jumpVelocity).toBeLessThan(PLAYER.jumpVelocity);
  });

  it('low gravity rows: no tightly timed rows, coins floating high', () => {
    const s = new LaneSpawner(createRng(2));
    const keys = new Set();
    let floating = 0;
    for (let i = 0; i < 400; i++) {
      const p = s.next(6, 28, { lowGravity: true });
      keys.add(p.key);
      floating += p.items.filter((it) => it.type === 'coin' && it.y === EVENTS.lowGravity.coinY).length;
    }
    expect(keys.has('jumpThenSlide')).toBe(false);
    expect(keys.has('sliders')).toBe(false);
    expect(floating).toBeGreaterThan(400);
  });
});

describe('v4 autopilot and fairness', () => {
  it('the autopilot takes pads and ramps and survives rows made of them', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = new LaneWorld({ rng: createRng(seed) });
      const bot = new Autopilot3D(w);
      const keys = ['turboStrip', 'rampJump', 'barrierRow', 'wallGate'];
      let n = 0;
      w.spawner.next = (level, speed, opts) => {
        const key = keys[n++ % keys.length];
        const pattern = PATTERNS3D.find((p) => p.key === key);
        return w.spawner._finish(pattern.key, pattern.build({ rng: w.courseRng, speed, level, drones: 0, lowGravity: !!opts?.lowGravity }), speed, level);
      };
      run(w, 90, () => bot.update(DT));
      expect(w.state, `seed ${seed}: ${w.deathCause}`).toBe('running');
      expect(w.stats.turbos).toBeGreaterThan(2);
      expect(w.stats.ramps).toBeGreaterThan(2);
    }
  });

  it('the autopilot survives storms and low gravity on several seeds', () => {
    for (const event of ['storm', 'lowGravity']) {
      for (const seed of [11, 12, 13, 14]) {
        const w = new LaneWorld({ rng: createRng(seed), modifiers: { event } });
        w.zone.index = event === 'storm' ? 1 : 4;
        w.level = 6;
        const bot = new Autopilot3D(w);
        // Start right at an event slot.
        w.distance = w.zone.start + GAME3D.ZONES.eventsAt[0] - 1;
        let started = false;
        run(w, 60, (world) => {
          bot.update(DT);
          if (world.event?.type === event) started = true;
        });
        expect(started).toBe(true);
        expect(w.state, `${event} seed ${seed}: ${w.deathCause}`).toBe('running');
      }
    }
  });
});
