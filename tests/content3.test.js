import { describe, expect, it } from 'vitest';
import { GAME3D, PLAYER } from '../src/config/game3d.config.js';
import { PERKS } from '../src/config/perks.js';
import { createRng } from '../src/logic/rng.js';
import { Autopilot3D } from '../src/logic3d/Autopilot3D.js';
import { LaneWorld } from '../src/logic3d/LaneWorld.js';

const DT = 1 / 60;

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
const drain = (w) => w.drainEvents();

describe('v3 enemies', () => {
  it('the ram stops, winds up, then charges down its lane', () => {
    const w = quietWorld();
    const ram = place(w, { type: 'charger', lane: 1 }, 40);
    const states = new Set();
    let windupZ = null;
    run(w, 4, () => {
      states.add(ram.state);
      if (ram.state === 'windup' && windupZ === null) windupZ = ram.z;
    });
    expect([...states]).toEqual(['approach', 'windup', 'charge']);
    expect(windupZ).toBeGreaterThan(20);
    expect(w.player.hp).toBe(PLAYER.baseHp - 1); // it reached the player
    expect(drain(w).map((e) => e.type)).toEqual(expect.arrayContaining(['chargerWindup', 'chargerCharge', 'smash', 'hurt']));
  });

  it('a ram can be shot down before it charges', () => {
    const w = quietWorld();
    const ram = place(w, { type: 'charger', lane: 1 }, 40);
    w.setFiring(true);
    run(w, 3);
    expect(ram.dead && ram.killed).toBe(true);
    expect(w.stats.chargers).toBe(1);
  });

  it('turrets fire plasma down their lane while in range', () => {
    const w = quietWorld();
    place(w, { type: 'turret', lane: 0 }, 60);
    let shots = 0;
    run(w, 3, (world) => {
      shots += world.drainEvents().filter((e) => e.type === 'enemyShot' && e.source === 'turret').length;
    });
    expect(shots).toBeGreaterThan(0);
    expect(w.player.hp).toBe(PLAYER.baseHp); // other lane
  });

  it('bombers hover ahead and drop mines', () => {
    const w = quietWorld();
    w.player.invulnerable = 1e9;
    const bomber = place(w, { type: 'bomber', lane: 1 }, 40);
    let drops = 0;
    run(w, 8, (world) => {
      drops += world.drainEvents().filter((e) => e.type === 'bomberDrop').length;
    });
    expect(drops).toBeGreaterThan(1);
    expect(bomber.z).toBeGreaterThan(20);
  });
});

describe('v3 obstacles', () => {
  it('sliders glide across all the lanes and must be jumped', () => {
    const w = quietWorld();
    const s = place(w, { type: 'slider' }, 200);
    const xs = [];
    run(w, 3, () => xs.push(s.x));
    expect(Math.min(...xs)).toBeLessThan(-2);
    expect(Math.max(...xs)).toBeGreaterThan(2);

    const crash = quietWorld();
    const a = place(crash, { type: 'slider' }, 8);
    a.phase = 0; // centered on the middle lane, where the player is
    a.period = 1e9;
    run(crash, 1);
    expect(crash.state).toBe('dead');
    expect(crash.deathCause).toBe('slider');
  });

  it('a hole in the road is fatal unless jumped (or shielded)', () => {
    const fall = quietWorld();
    place(fall, { type: 'gap', lane: 1 }, 10);
    run(fall, 1.5);
    expect(fall.deathCause).toBe('gap');

    const jump = quietWorld();
    place(jump, { type: 'gap', lane: 1 }, 10);
    run(jump, 1.5, (w) => {
      const g = w.entities.find((e) => e.type === 'gap');
      if (g && g.z - g.d / 2 < 3.5) w.jump();
    });
    expect(jump.state).toBe('running');

    const shield = quietWorld();
    shield.player.shield = true;
    place(shield, { type: 'gap', lane: 1 }, 10);
    run(shield, 1.5);
    expect(shield.state).toBe('running');
    expect(shield.player.shield).toBe(false);
  });

  it('shots fly over holes, sliders and meteor markers', () => {
    const w = quietWorld();
    place(w, { type: 'gap', lane: 1 }, 15);
    const crate = place(w, { type: 'crate', lane: 1 }, 30);
    w.setFiring(true);
    w.player.invulnerable = 1e9;
    run(w, 1);
    expect(crate.dead).toBe(true);
  });
});

describe('v3 run events', () => {
  /** Zone 1 world right before an event slot. */
  const eventWorld = (modifiers) => {
    const w = new LaneWorld({ rng: createRng(4), modifiers });
    w.zone.index = 1;
    w.distance = w.zone.start + GAME3D.ZONES.eventsAt[0] - 1;
    w.player.invulnerable = 1e9;
    return w;
  };

  it('events start at their zone slots, one at a time', () => {
    const w = eventWorld();
    const started = [];
    run(w, 60, (world) => {
      for (const e of world.drainEvents()) if (e.type === 'eventStart') started.push(e.event);
      world.player.invulnerable = 1e9;
    });
    expect(started.length).toBeGreaterThanOrEqual(2);
    expect(started[0]).not.toBe(started[1]); // never the same twice in a row
  });

  it('gold rush: coins on every lane and a faster road', () => {
    const w = eventWorld({ event: 'goldRush' });
    run(w, 0.2);
    expect(w.event?.type).toBe('goldRush');
    const normal = w._speedAt(w.time) / GAME3D.EVENTS.goldRush.speed;
    expect(w.speed).toBeCloseTo(normal * GAME3D.EVENTS.goldRush.speed, 5);
    run(w, 3);
    const lanes = new Set(w.entities.filter((e) => e.type === 'coin').map((e) => e.lane));
    expect(lanes.size).toBe(3);
    run(w, GAME3D.EVENTS.goldRush.duration);
    expect(w.event).toBeNull();
  });

  it('meteors land on the lane you are in; moving away avoids them', () => {
    const stay = eventWorld({ event: 'meteors' });
    stay.player.invulnerable = 0;
    stay.player.hp = 99;
    let impacts = 0;
    run(stay, 8, (w) => {
      for (const e of w.drainEvents()) if (e.type === 'meteorImpact' && e.hit) impacts += 1;
      w.player.invulnerable = 0;
    });
    expect(impacts).toBeGreaterThan(0);

    const dodge = eventWorld({ event: 'meteors' });
    dodge.player.invulnerable = 0;
    const bot = new Autopilot3D(dodge);
    let hits = 0;
    run(dodge, 9, (w) => {
      bot.update(DT);
      for (const e of w.drainEvents()) if (e.type === 'meteorImpact' && e.hit) hits += 1;
    });
    expect(hits).toBeLessThan(impacts);
  });

  it('ambush: enemy waves on a slower road, coins if all are shot down', () => {
    const w = eventWorld({ event: 'ambush' });
    run(w, 0.2);
    expect(w.event?.type).toBe('ambush');
    expect(w.speed).toBeLessThan(w._speedAt(w.time) / GAME3D.EVENTS.ambush.speed);
    const coins = w.score.coins;
    const bot = new Autopilot3D(w);
    let end = null;
    run(w, 25, (world) => {
      bot.update(DT);
      for (const e of world.drainEvents()) if (e.type === 'eventEnd') end = e;
      world.player.invulnerable = 1e9;
    });
    expect(end).not.toBeNull();
    if (end.success) expect(w.score.coins - coins).toBeGreaterThanOrEqual(GAME3D.EVENTS.ambush.reward);
  });

  it('jetpack: flies over walls, sky coins, shots still reach the ground, safe landing', () => {
    const w = quietWorld();
    const pack = place(w, { type: 'jetpack', y: 0.5 }, 4);
    run(w, 0.4);
    expect(pack.dead).toBe(true);
    expect(w.player.jetpack).toBeGreaterThan(0);
    run(w, 1);
    expect(w.player.y).toBeCloseTo(GAME3D.JETPACK.height, 1);
    expect(w.jump()).toBe(false);
    place(w, { type: 'wall', lane: 1 }, 20);
    const crate = place(w, { type: 'crate', lane: 1 }, 40);
    w.setFiring(true);
    const coins = w.score.coins;
    run(w, 2);
    expect(w.state).toBe('running');
    expect(crate.dead).toBe(true);
    expect(w.score.coins).toBeGreaterThan(coins); // sky coins
    w.setFiring(false);
    run(w, GAME3D.JETPACK.duration);
    expect(w.player.jetpack).toBe(0);
    expect(w.player.grounded).toBe(true);
  });
});

describe('v3 perks', () => {
  const afterBoss = (seed = 2) => {
    const w = quietWorld({ seed });
    w.distance = GAME3D.ZONES.bossAt + 1;
    w.step(DT);
    w._finishBoss(true);
    return w;
  };

  it('three distinct perks are offered after each boss', () => {
    const w = afterBoss();
    expect(w.perkOffer).toHaveLength(3);
    expect(new Set(w.perkOffer).size).toBe(3);
    expect(w.drainEvents().some((e) => e.type === 'perkOffer')).toBe(true);
    expect(w.choosePerk('not-offered')).toBe(false);
    expect(w.choosePerk(w.perkOffer[0])).toBe(true);
    expect(w.perkOffer).toBeNull();
    expect(w.stats.perks).toBe(1);
  });

  it('maxed perks are never offered again', () => {
    const w = quietWorld();
    for (const p of PERKS) w.perks[p.id] = p.max;
    w.perks.damage = 0;
    expect(w.rollPerks(3)).toEqual(['damage']);
  });

  it('perks change the numbers they promise', () => {
    const w = quietWorld();
    const base = w.weaponStats;
    const hp = w.maxHp;
    Object.assign(w.perks, { damage: 2, fireRate: 1, pierce: 1, multishot: 1, heart: 1, slowmo: 1 });
    expect(w.weaponStats.damage).toBeCloseTo(base.damage * 1.5);
    expect(w.weaponStats.interval).toBeLessThan(base.interval);
    expect(w.weaponStats.pierce).toBe(true);
    expect(w.maxHp).toBe(hp + 1);
    expect(w._speedAt(1000)).toBeLessThan(GAME3D.SPEED.max);
    w.setFiring(true);
    run(w, 0.05);
    expect(w.shots.length).toBe(3); // multishot
  });

  it('explosive kills damage nearby enemies; vampire heals', () => {
    const w = quietWorld();
    w.perks.explosive = 1;
    const a = place(w, { type: 'crate', lane: 1 }, 20);
    const b = place(w, { type: 'walker', lane: 0 }, 21);
    b.hp = 2;
    w._kill(a);
    expect(b.dead).toBe(true);

    const v = quietWorld();
    v.perks.vampire = 1;
    v.player.hp = 1;
    for (let i = 0; i < 20; i++) v._kill(place(v, { type: 'walker', lane: 1 }, 30));
    expect(v.player.hp).toBe(2);
  });

  it('shield regeneration brings a lost shield back', () => {
    const w = quietWorld();
    w.perks.shieldRegen = 1;
    w.player.shield = false;
    run(w, 26);
    expect(w.player.shield).toBe(true);
  });
});

describe('v3 modes', () => {
  it('boss rush: a boss right away and only coins in between', () => {
    const w = new LaneWorld({ rng: createRng(1), mode: 'bossRush' });
    w.player.invulnerable = 1e9;
    run(w, 4);
    expect(w.boss).not.toBeNull();
    expect(w.entities.some((e) => e.kind === 'obstacle')).toBe(false);
    expect(w.event).toBeNull();
  });

  it('daily modifiers: speed, fixed hearts, forced weapon, score multiplier', () => {
    const w = new LaneWorld({ rng: createRng(1), modifiers: { speed: 1.2, hp: 1, weapon: 'laser', score: 2 } });
    expect(w.maxHp).toBe(1);
    expect(w.player.hp).toBe(1);
    expect(w.loadout.weapon).toBe('laser');
    w.step(DT);
    const plain = new LaneWorld({ rng: createRng(1) });
    plain.step(DT);
    expect(w.speed).toBeCloseTo(plain.speed * 1.2, 5);
    expect(w.score.score).toBeGreaterThanOrEqual(plain.score.score);
  });

  it('the autopilot survives boss rush and daily modifiers for a while', () => {
    for (const opts of [{ mode: 'bossRush' }, { modifiers: { speed: 1.2 } }, { modifiers: { event: 'meteors' } }]) {
      for (let seed = 1; seed <= 3; seed++) {
        const w = new LaneWorld({ rng: createRng(seed), ...opts });
        const bot = new Autopilot3D(w);
        run(w, 90, () => {
          bot.update(DT);
          w.drainEvents();
        });
        expect(w.state, `${JSON.stringify(opts)} seed ${seed}: ${w.deathCause}`).toBe('running');
      }
    }
  });
});
