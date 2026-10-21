import { describe, expect, it } from 'vitest';
import { GAME3D, laneX } from '../src/config/game3d.config.js';
import { createRng } from '../src/logic/rng.js';
import { Autopilot3D } from '../src/logic3d/Autopilot3D.js';
import { LaneWorld } from '../src/logic3d/LaneWorld.js';

const DT = 1 / 60;
const { ASSAULT, CHAOS, PARKOUR, HARDCORE } = GAME3D;
const FLYERS = new Set(['drone', 'bomber', 'sniper']);

function world(mode, seed = 3) {
  return new LaneWorld({ rng: createRng(seed), mode });
}
function run(w, seconds, each) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    each?.(w, i);
    w.step(DT);
  }
}
/** Nothing can hurt the runner (to look at the rules, not at the dodging). */
function safe(w) {
  w.safe = true;
  return w;
}
function killAll(w) {
  for (const e of w.entities) if (e.kind === 'enemy' && !e.dead) w._kill(e);
}

describe('v6 assault: waves of enemies', () => {
  it('the first wave comes after a short wait, on a road with only coins', () => {
    const w = safe(world('assault'));
    run(w, ASSAULT.firstWave - 0.3);
    expect(w.assault.wave).toBe(0);
    run(w, 0.6);
    expect(w.assault.wave).toBe(1);
    expect(w.drainEvents().some((e) => e.type === 'waveStart' && e.wave === 1)).toBe(true);
    run(w, 30, killAll);
    expect(w.entities.filter((e) => e.kind === 'obstacle')).toHaveLength(0);
  });

  it('waves grow, and a group never fills all three lanes on the ground', () => {
    const w = world('assault');
    for (const n of [1, 3, 6, 10, 20]) {
      const groups = w._assaultGroups(n);
      const total = groups.reduce((s, g) => s + g.length, 0);
      expect(total).toBe(Math.min(ASSAULT.maxEnemies, 3 + Math.floor(n * 0.9)));
      for (const g of groups) {
        expect(g.filter((i) => !FLYERS.has(i.type)).length).toBeLessThanOrEqual(2);
        expect(new Set(g.map((i) => i.lane)).size).toBe(g.length);
      }
      expect(groups.flat().filter((i) => FLYERS.has(i.type)).length).toBeLessThanOrEqual(3);
    }
    // Tougher enemies only later on.
    const early = new Set(w._assaultGroups(1).flat().map((i) => i.type));
    for (const t of ['charger', 'turret', 'bomber', 'sniper', 'guard']) expect(early.has(t)).toBe(false);
  });

  it('a wave shot down to the last enemy pays coins and a perfect bonus', () => {
    const w = safe(world('assault'));
    run(w, 40, (world) => {
      killAll(world);
      if (world.perkOffer) world.choosePerk(world.perkOffer[0]);
    });
    const clears = [];
    const w2 = safe(world('assault'));
    run(w2, 25, (world) => {
      killAll(world);
      clears.push(...world.drainEvents().filter((e) => e.type === 'waveClear'));
    });
    expect(clears.length).toBeGreaterThan(0);
    expect(clears[0]).toMatchObject({ wave: 1, perfect: true, coins: ASSAULT.coins + ASSAULT.perWave });
    expect(clears[0].points).toBeGreaterThan(0);
    expect(w.stats.waves).toBeGreaterThanOrEqual(2);
  });

  it('every fifth wave is a boss that does not flee; then a perk and a new zone', () => {
    const w = safe(world('assault'));
    w.assault.wave = ASSAULT.bossEvery - 1;
    w.assault.timer = 0;
    w.step(DT);
    expect(w.assault.state).toBe('boss');
    expect(w.boss).toBeTruthy();
    run(w, GAME3D.BOSS.timeLimit + 3, (world) => world.boss && (world.boss.attackTimer = 1e9));
    expect(w.boss.leaving).toBe(false);
    expect(w.boss.enraged).toBe(true);
    // Through its shields (one per phase threshold) down to zero.
    while (w.boss) {
      w.boss.shield = 0;
      w._damageBoss(w.boss, 1e9, 0, 1, w.boss.z);
    }
    expect(w.zone.index).toBe(1);
    expect(w.perkOffer).toBeTruthy();
    w.step(DT);
    expect(w.stats.waves).toBe(ASSAULT.bossEvery);
    // The next wave waits for the perk.
    run(w, 6);
    expect(w.assault.wave).toBe(ASSAULT.bossEvery);
    w.choosePerk(w.perkOffer[0]);
    run(w, 7);
    expect(w.assault.wave).toBe(ASSAULT.bossEvery + 1);
  });
});

describe('v6 chaos: the rules keep changing', () => {
  it('mutations come one after the other, all of them before any repeats, and raise the multiplier', () => {
    const w = safe(world('chaos'));
    w.zone.start = -1e9; // no boss in the way
    w.zone.bossDone = true;
    const seen = [];
    run(w, CHAOS.first + CHAOS.every * CHAOS.mutators.length + 2, (world) => {
      for (const e of world.drainEvents()) if (e.type === 'mutator') seen.push(e.id);
    });
    expect(seen.slice(0, CHAOS.mutators.length).sort()).toEqual([...CHAOS.mutators].sort());
    expect(w.chaos.mult).toBe(CHAOS.multMax);
    expect(w.scoreMult).toBeGreaterThanOrEqual(CHAOS.multMax);
  });

  it('no ordinary run events in chaos: only the mutations start them', () => {
    const w = safe(world('chaos'));
    w.chaos.timer = 1e9;
    run(w, 40);
    expect(w.event).toBeNull();
  });

  it('mirror swaps left and right', () => {
    const w = world('chaos');
    w._startMutator('mirror');
    w.moveLeft();
    expect(w.player.lane).toBe(2);
    w.moveRight();
    expect(w.player.lane).toBe(1);
  });

  it('tiny shrinks the runner and its hitbox; hyper speeds the road up', () => {
    const w = world('chaos');
    const box = w.playerBox();
    w._startMutator('tiny');
    const small = w.playerBox();
    expect(small.y1 - small.y0).toBeCloseTo((box.y1 - box.y0) * CHAOS.tiny);
    expect(w.hud().scale).toBe(CHAOS.tiny);
    w._endMutator();
    const v = w._speedAt(30);
    w._startMutator('hyper');
    expect(w._speedAt(30)).toBeCloseTo(v * CHAOS.hyper);
  });

  it('event mutations run the event for the chaos duration, whatever the zone', () => {
    const w = safe(world('chaos'));
    w._startMutator('blackout'); // not a city-only event here
    expect(w.event.type).toBe('blackout');
    expect(w.mutator.event).toBe(true);
    run(w, CHAOS.duration + 1);
    expect(w.event).toBeNull();
    expect(w.mutator).toBeNull();
    expect(w.stats.mutations).toBe(1);
  });

  it('rockets and magnet keep their power-ups on while they last', () => {
    const w = safe(world('chaos'));
    w._startMutator('rockets');
    run(w, 5);
    expect(w.player.rockets).toBeGreaterThan(0);
    w._endMutator();
    w._startMutator('magnet');
    run(w, 5);
    expect(w.player.magnet).toBeGreaterThan(0);
    expect(w.player.double).toBeGreaterThan(0);
  });
});

describe('v6 parkour: no weapon, style instead', () => {
  it('cannot shoot, never meets a boss, changes zone every kilometer', () => {
    const w = safe(world('parkour'));
    w.setFiring(true);
    w.fire();
    run(w, 70);
    expect(w.stats.shots).toBe(0);
    expect(w.boss).toBeNull();
    expect(Math.floor(w.distance / PARKOUR.zoneEvery)).toBeGreaterThanOrEqual(1);
    expect(w.zone.index).toBe(Math.floor(w.distance / PARKOUR.zoneEvery));
  });

  it('rows are obstacle courses: no flying or shooting enemies', () => {
    const w = safe(world('parkour', 7));
    const types = new Set();
    run(w, 120, (world) => world.entities.forEach((e) => types.add(e.type)));
    for (const t of ['drone', 'bomber', 'sniper', 'turret', 'charger', 'guard']) expect(types.has(t), t).toBe(false);
    expect(types.has('ramp') || types.has('platform') || types.has('gap')).toBe(true);
  });

  it('jumping over and sliding under obstacles are tricks; the chain multiplies, a hit breaks it', () => {
    const w = world('parkour');
    w.distanceToNext = Infinity;
    w.entities = [];
    const barrier = w._addEntity({ type: 'barrier', lane: 1, dz: 0 }, 9);
    run(w, 0.2);
    w.jump();
    run(w, 0.8);
    expect(barrier.passed).toBe(true);
    expect(w.stats.tricks).toBe(1);
    run(w, 0.8);
    const beam = w._addEntity({ type: 'beam', lane: 1, dz: 0 }, 5);
    w.slide();
    run(w, 0.6);
    expect(beam.passed).toBe(true);
    expect(w.stats.tricks).toBe(2);
    expect(w.combo.count).toBe(2);
    const events = w.drainEvents().filter((e) => e.type === 'trick');
    expect(events.map((e) => e.kind)).toEqual(['air', 'slide']);
    expect(events[1].points).toBe(events[0].points * 2);
    w.player.invulnerable = 0;
    w._damage('walker');
    expect(w.combo.count).toBe(0);
  });

  it('an obstacle in another lane is no trick', () => {
    const w = world('parkour');
    w.distanceToNext = Infinity;
    w.entities = [];
    w._addEntity({ type: 'barrier', lane: 0, dz: 0 }, 9);
    w.jump();
    run(w, 1.2);
    expect(w.stats.tricks).toBe(0);
  });
});

describe('v6 hardcore', () => {
  it('one heart, no second chance, no healing perks, triple score', () => {
    const w = world('hardcore');
    expect(w.maxHp).toBe(HARDCORE.hp);
    expect(w.scoreMult).toBe(HARDCORE.score);
    for (let i = 0; i < 200; i++) for (const id of w.rollPerks(3)) expect(HARDCORE.noPerks).not.toContain(id);
    w._damage('walker');
    expect(w.state).toBe('dead');
    expect(w.canRevive).toBe(false);
    expect(w.revive()).toBe(false);
  });

  it('the road is faster', () => {
    expect(world('hardcore')._speedAt(20)).toBeCloseTo(world('endless')._speedAt(20) * HARDCORE.speed);
  });
});

describe('v6 fairness: the autopilot gets through every new mode', () => {
  for (const mode of ['assault', 'chaos', 'parkour', 'hardcore']) {
    it(`${mode}: two minutes on two seeds`, () => {
      for (const seed of [11, 12]) {
        const w = world(mode, seed);
        const bot = new Autopilot3D(w);
        run(w, 120, (world) => {
          if (world.perkOffer) world.choosePerk(world.perkOffer[0]);
          if (world.state === 'running') bot.update(DT);
        });
        expect(w.state, `${mode} seed ${seed}: ${w.deathCause}`).toBe('running');
        if (mode === 'assault') expect(w.stats.waves).toBeGreaterThanOrEqual(6);
        if (mode === 'chaos') expect(w.stats.mutations).toBeGreaterThanOrEqual(4);
        if (mode === 'parkour') expect(w.stats.tricks).toBeGreaterThan(10);
      }
    });
  }

  it('the chaos mirror does not fool the autopilot', () => {
    const w = world('chaos', 5);
    w.zone.bossDone = true;
    const bot = new Autopilot3D(w);
    w._startMutator('mirror');
    w.mutator.duration = 1e9;
    run(w, 60, (world) => world.state === 'running' && bot.update(DT));
    expect(w.state).toBe('running');
    expect(laneX(w.player.lane)).toBeCloseTo(w.player.x, 0);
  });
});
