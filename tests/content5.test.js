import { describe, expect, it } from 'vitest';
import { GAME3D } from '../src/config/game3d.config.js';
import { createRng } from '../src/logic/rng.js';
import { Autopilot3D } from '../src/logic3d/Autopilot3D.js';
import { LaneWorld } from '../src/logic3d/LaneWorld.js';

const DT = 1 / 60;
const { BOSS, BOSS_RUSH } = GAME3D;

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
/** World with its boss settled in front of the player, attacks paused. */
function bossWorld(opts = {}) {
  const w = quietWorld(opts);
  w.zone.index = opts.zone ?? 0;
  w._spawnBoss();
  w.boss.z = BOSS.z;
  w.boss.attackTimer = 1e9;
  w.drainEvents();
  return w;
}

describe('v5 bosses: attacks that shots cannot stop', () => {
  it('heavy plasma soaks up shots and has to be dodged', () => {
    const w = bossWorld();
    w._bossAttack(w.boss, 'heavy');
    const heavy = w.eshots.filter((s) => s.heavy);
    expect(heavy).toHaveLength(2);
    // Stand in a heavy lane and shoot: it still arrives.
    w.player.lane = Math.round(heavy[0].x / GAME3D.LANES.width) + 1;
    w.player.x = heavy[0].x;
    w.setFiring(true);
    run(w, 3);
    expect(w.player.hp).toBe(w.maxHp - 1);
    expect(w.deathCause ?? 'plasma').toBe('plasma');
  });

  it('a quake must be jumped, a laser slid under', () => {
    for (const [kind, dodge] of [['quake', 'jump'], ['laser', 'slide']]) {
      for (const doDodge of [false, true]) {
        const w = bossWorld();
        w._bossAttack(w.boss, kind);
        const wave = w.waves[0];
        let done = false;
        run(w, 4, (world) => {
          const arrive = (wave.z - 0.45) / wave.speed;
          if (doDodge && !done && wave.charge <= 0 && arrive < 0.15) {
            done = true;
            world[dodge]();
          }
        });
        expect(w.player.hp, `${kind}, dodge ${doDodge}`).toBe(doDodge ? w.maxHp : w.maxHp - 1);
      }
    }
  });

  it('shots pass through quakes and lasers (they cannot be shot down)', () => {
    const w = bossWorld();
    w._bossAttack(w.boss, 'laser');
    w.setFiring(true);
    run(w, 1.2);
    expect(w.waves).toHaveLength(1);
  });
});

describe('v5 bosses: shield phases, combos, enrage', () => {
  it('a phase threshold raises a shield: shots bounce off until it drops', () => {
    const w = bossWorld();
    const b = w.boss;
    w._damageBoss(b, b.maxHp * 0.6, 0, 1, b.z);
    expect(b.hp).toBe(Math.ceil(b.maxHp * 0.5)); // clamped at the threshold
    expect(b.shield).toBeGreaterThan(0);
    expect(w.drainEvents().some((e) => e.type === 'bossShield')).toBe(true);
    const hp = b.hp;
    w._damageBoss(b, 5, 0, 1, b.z);
    expect(b.hp).toBe(hp);
    run(w, BOSS.shieldTime + 0.1);
    expect(b.shield).toBe(0);
    w._damageBoss(b, 5, 0, 1, b.z);
    expect(b.hp).toBe(hp - 5);
  });

  it('a shielded boss fires only attacks that have to be dodged', () => {
    const w = bossWorld({ zone: 3 });
    const b = w.boss;
    b.shield = 3;
    b.attackTimer = 0;
    const kinds = [];
    run(w, 2.9, (world) => {
      for (const e of world.drainEvents()) {
        if (e.type === 'bossWave') kinds.push(e.kind);
        if (e.type === 'enemyShot') kinds.push(e.heavy ? 'heavy' : 'plasma');
      }
    });
    expect(kinds.length).toBeGreaterThan(1);
    expect(kinds.every((k) => ['heavy', 'quake', 'laser'].includes(k))).toBe(true);
  });

  it('later bosses fire fair pairs of attacks', () => {
    const w = bossWorld({ zone: 4, seed: 9 });
    w.player.invulnerable = 1e9;
    w.boss.attackTimer = 0;
    let pairs = 0;
    run(w, 30, (world) => {
      const evs = world.drainEvents();
      const waves = evs.filter((e) => e.type === 'bossWave').length;
      const shots = evs.filter((e) => e.type === 'enemyShot' || e.type === 'bossDrop' || e.type === 'bossSummon').length;
      if (waves && shots) pairs += 1;
    });
    expect(pairs).toBeGreaterThan(1);
  });

  it('boss rush: bosses never flee, they get enraged and attack faster', () => {
    const w = bossWorld({ mode: 'bossRush' });
    w.player.invulnerable = 1e9;
    w.boss.attackTimer = 1;
    run(w, BOSS_RUSH.enrageAfter + BOSS.timeLimit);
    expect(w.boss).not.toBeNull();
    expect(w.boss.leaving).toBe(false);
    expect(w.boss.enraged).toBe(true);
    expect(w.hud().boss.enraged).toBe(true);
  });

  it('outside the boss rush an undefeated boss still leaves', () => {
    const w = bossWorld();
    w.player.invulnerable = 1e9;
    run(w, BOSS.timeLimit + 4);
    expect(w.boss).toBeNull();
    expect(w.zone.index).toBe(1);
  });
});

describe('v5 boss rush difficulty', () => {
  it('boss health grows with each boss and with the firepower of the perks', () => {
    const hpAt = (zone, perks = {}) => {
      const w = quietWorld({ mode: 'bossRush' });
      w.zone.index = zone;
      Object.assign(w.perks, perks);
      w._spawnBoss();
      return w.boss.maxHp;
    };
    expect(hpAt(1)).toBeGreaterThan(hpAt(0));
    expect(hpAt(4)).toBeGreaterThan(hpAt(1) * 2);
    const strong = hpAt(2, { damage: 4, fireRate: 4, multishot: 1 });
    expect(strong).toBeGreaterThan(hpAt(2) * 3);
  });

  it('boss rush never offers healing loops or useless perks', () => {
    const w = quietWorld({ mode: 'bossRush' });
    for (let i = 0; i < 200; i++) for (const id of w.rollPerks(3)) expect(BOSS_RUSH.noPerks).not.toContain(id);
  });

  it('holding fire without moving no longer wins: the first boss ends the run', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const w = new LaneWorld({ rng: createRng(seed), mode: 'bossRush' });
      run(w, 90, (world) => {
        if (world.perkOffer) world.choosePerk(world.perkOffer[0]);
        world.setFiring(true);
      });
      expect(w.state, `seed ${seed}`).toBe('dead');
      expect(w.stats.bosses, `seed ${seed}`).toBeLessThanOrEqual(1);
    }
  });

  it('a player who dodges gets through several bosses', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const w = new LaneWorld({ rng: createRng(seed), mode: 'bossRush' });
      const bot = new Autopilot3D(w);
      run(w, 150, () => bot.update(DT));
      expect(w.stats.bosses, `seed ${seed}: ${w.deathCause}`).toBeGreaterThanOrEqual(3);
    }
  });
});

const place = (w, item, z) => w._addEntity({ dz: 0, lane: 1, ...item }, z);
const { OVERDRIVE, NEAR_MISS, ENEMIES, OBSTACLES, EVENTS } = GAME3D;
const BASE_HP = GAME3D.PLAYER.baseHp;

describe('v5 overdrive', () => {
  it('fills with coins and kills, triggers only when full', () => {
    const w = quietWorld();
    expect(w.activateOverdrive()).toBe(false);
    for (let i = 0; i < 20; i++) w._collect({ type: 'coin', x: 0, y: 0.5, z: 0 });
    expect(w.player.od).toBeCloseTo(20 * OVERDRIVE.gain.coin, 5);
    w.player.od = 1;
    expect(w.activateOverdrive()).toBe(true);
    expect(w.player.od).toBe(0);
    expect(w.stats.overdrives).toBe(1);
  });

  it('bullet time: the world slows down while the overdrive runs in real time', () => {
    const plain = quietWorld();
    const od = quietWorld();
    od.player.od = 1;
    od.activateOverdrive();
    run(plain, 2);
    run(od, 2);
    expect(od.time).toBeCloseTo(plain.time * OVERDRIVE.timeScale, 1);
    expect(od.player.overdrive).toBeCloseTo(OVERDRIVE.duration - 2, 1);
    run(od, OVERDRIVE.duration);
    expect(od.player.overdrive).toBe(0);
  });

  it('stronger, faster shots and double score while it runs; no meter gain meanwhile', () => {
    const w = quietWorld();
    const before = w.weaponStats;
    const mult = w.scoreMult;
    w.player.od = 1;
    w.activateOverdrive();
    expect(w.weaponStats.damage).toBeCloseTo(before.damage * OVERDRIVE.damage, 5);
    expect(w.weaponStats.interval).toBeCloseTo(before.interval * OVERDRIVE.fireRate, 5);
    expect(w.scoreMult).toBeCloseTo(mult * OVERDRIVE.score, 5);
    w._collect({ type: 'coin', x: 0, y: 0.5, z: 0 });
    expect(w.player.od).toBe(0);
  });
});

describe('v5 near misses', () => {
  it('an obstacle passing in the lane just left is a near miss', () => {
    const w = quietWorld();
    place(w, { type: 'wall', lane: 1 }, 4);
    run(w, 0.1);
    w.moveLeft();
    run(w, 0.5);
    expect(w.stats.nearMisses).toBe(1);
    expect(w.state).toBe('running');
    expect(w.drainEvents().find((e) => e.type === 'nearMiss').points).toBe(NEAR_MISS.points);
  });

  it('no near miss for a lane left long ago, or for coins', () => {
    const w = quietWorld();
    w.moveLeft();
    run(w, 1);
    place(w, { type: 'wall', lane: 1 }, 3);
    place(w, { type: 'coin', lane: 1 }, 3);
    run(w, 0.6);
    expect(w.stats.nearMisses).toBe(0);
  });
});

describe('v5 threats', () => {
  it('laser fences blink: on they cost a heart, off they let you through', () => {
    const { on, off } = OBSTACLES.fence;
    const throughAt = (phaseAtArrival) => {
      const w = quietWorld();
      // Arrives in ~0.4 s at 15 m/s: choose the phase it will have then.
      const fence = place(w, { type: 'fence', lane: 1, phase: 0 }, 6.4);
      fence.phase = (((phaseAtArrival - 6.4 / w.speed) % (on + off)) + on + off) % (on + off);
      run(w, 1);
      return w.player.hp;
    };
    expect(throughAt(0.3)).toBe(BASE_HP - 1);
    expect(throughAt(on + off / 2)).toBe(BASE_HP);
  });

  it('a sniper locks a lane, fires down it, and misses once you move', () => {
    for (const move of [false, true]) {
      const w = quietWorld();
      const s = place(w, { type: 'sniper', lane: 0 }, 60);
      s.holdZ = 45;
      let aimed = false;
      run(w, 3.5, (world) => {
        for (const e of world.drainEvents()) if (e.type === 'sniperAim' && !aimed) {
          aimed = true;
          if (move) world.moveRight();
        }
      });
      expect(aimed).toBe(true);
      expect(w.player.hp, `move ${move}`).toBe(move ? BASE_HP : BASE_HP - 1);
    }
  });

  it('a guard shield soaks up shots before the guard takes damage; rockets get past it', () => {
    const w = quietWorld();
    const g = place(w, { type: 'guard', lane: 1 }, 40);
    const shield = g.shieldHp;
    w.setFiring(true);
    run(w, 0.5);
    expect(g.shieldHp).toBeLessThan(shield);
    expect(g.hp).toBe(g.maxHp);
    const r = quietWorld();
    const g2 = place(r, { type: 'guard', lane: 0 }, 40);
    r.player.rockets = 5;
    run(r, 2);
    expect(g2.hp < g2.maxHp || g2.dead).toBe(true);
    expect(g2.shieldHp).toBe(ENEMIES.guard.shield);
  });

  it('rush hour: cars race down at most two lanes, after the rows already on the road', () => {
    const w = quietWorld();
    w.player.invulnerable = 1e9;
    w._startEvent('traffic');
    expect(w.event.delay).toBeGreaterThan(1);
    let cars = 0;
    run(w, EVENTS.traffic.duration, (world) => {
      for (const e of world.drainEvents()) if (e.type === 'carIncoming') {
        cars += 1;
        expect(e.lanes.length).toBeLessThanOrEqual(2);
        expect(world.event.t).toBeGreaterThanOrEqual(world.event.delay - 1e-6);
      }
    });
    expect(cars).toBeGreaterThan(4);
  });

  it('blackout: score x1.5 and rows a bit further apart, only in its zones', () => {
    const w = quietWorld();
    const mult = w.scoreMult;
    w._startEvent('blackout');
    expect(w.scoreMult).toBeCloseTo(mult * EVENTS.blackout.score, 5);
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      const z = new LaneWorld({ rng: createRng(i) });
      z.zone.index = 2; // ice: no blackout there
      seen.add(z._pickEvent());
    }
    expect(seen.has('blackout')).toBe(false);
  });

  it('the autopilot survives traffic, blackouts and the new rows', () => {
    for (const event of ['traffic', 'blackout']) {
      for (const seed of [21, 22, 23]) {
        const w = new LaneWorld({ rng: createRng(seed), modifiers: { event } });
        w.zone.index = event === 'traffic' ? 1 : 3;
        w.level = 6;
        w.distance = w.zone.start + GAME3D.ZONES.eventsAt[0] - 1;
        const bot = new Autopilot3D(w);
        run(w, 60, () => bot.update(DT));
        expect(w.state, `${event} seed ${seed}: ${w.deathCause}`).toBe('running');
      }
    }
  });
});

describe('v5 campaign', () => {
  it('24 levels over the 6 zones, every goal and twist with its texts', async () => {
    const { CAMPAIGN } = await import('../src/config/campaign.js');
    const { STRINGS } = await import('../src/i18n.js');
    expect(CAMPAIGN).toHaveLength(24);
    for (const level of CAMPAIGN) {
      expect(level.zone).toBe(Math.floor((level.id - 1) / 4));
      for (const lang of Object.keys(STRINGS)) {
        expect(STRINGS[lang][`goal_${level.goal.type}`], `${lang} goal ${level.goal.type}`).toBeTruthy();
        expect(STRINGS[lang][`goalUnit_${level.goal.type}`]).toBeTruthy();
        if (level.twist) expect(STRINGS[lang][`twist_${level.twist}`], `${lang} twist ${level.twist}`).toBeTruthy();
      }
      expect(level.starCoins || level.starTime).toBeTruthy();
      if (level.goal.type === 'coins') expect(level.starTime).toBeTruthy(); // a coin star could never be reached
    }
  });

  it('a level starts in its zone, ends as won when the goal is reached', async () => {
    const { getLevel } = await import('../src/config/campaign.js');
    const level = getLevel(1);
    const w = new LaneWorld({ rng: createRng(1), campaign: level });
    expect(w.mode).toBe('campaign');
    const z = new LaneWorld({ rng: createRng(1), campaign: getLevel(13) });
    expect(z.zone.index).toBe(3);
    w.player.invulnerable = 1e9;
    let done = null;
    run(w, 120, (world) => {
      for (const e of world.drainEvents()) if (e.type === 'levelComplete') done = e;
      world.player.invulnerable = 1e9;
    });
    expect(w.state).toBe('won');
    expect(done.level).toBe(1);
    expect(w.distance).toBeGreaterThanOrEqual(level.goal.value);
    expect(w.hud().goal.progress).toBe(level.goal.value);
  });

  it('twists: no shooting, row weights, enraged bosses instead of fleeing', async () => {
    const { getLevel } = await import('../src/config/campaign.js');
    const w = new LaneWorld({ rng: createRng(2), campaign: getLevel(3) });
    w.setFiring(true);
    w.fire();
    run(w, 1);
    expect(w.shots).toHaveLength(0);

    // Row weights: a boosted row comes up most of the time (never 3 times in a row).
    const { LaneSpawner } = await import('../src/logic3d/LaneSpawner.js');
    const share = (weights) => {
      const sp = new LaneSpawner(createRng(5));
      let strips = 0;
      for (let i = 0; i < 300; i++) if (sp.next(6, 25, { weights }).key === 'turboStrip') strips += 1;
      return strips / 300;
    };
    expect(share({ turboStrip: 50 })).toBeGreaterThan(0.4);
    expect(share({})).toBeLessThan(0.1);

    const b = new LaneWorld({ rng: createRng(3), campaign: getLevel(4) });
    b.player.invulnerable = 1e9;
    b.distanceToNext = Infinity;
    b.zone.start = 0;
    b.distance = 360;
    run(b, 1);
    expect(b.boss).not.toBeNull();
    b.boss.attackTimer = 1e9;
    run(b, GAME3D.BOSS.timeLimit + 3, () => (b.boss.attackTimer = 1e9));
    expect(b.boss?.enraged).toBe(true);
    expect(b.boss.leaving).toBe(false);
  });

  it('stars: complete, coins (or time on coin levels), no hearts lost', async () => {
    const { getLevel, starsFor } = await import('../src/config/campaign.js');
    const l1 = getLevel(1);
    expect(starsFor(l1, { won: true, coins: l1.starCoins, hits: 0 })).toEqual([true, true, true]);
    expect(starsFor(l1, { won: true, coins: 0, hits: 2 })).toEqual([true, false, false]);
    expect(starsFor(l1, { won: false, coins: 999, hits: 0 })).toEqual([false, false, false]);
    const l5 = getLevel(5);
    expect(starsFor(l5, { won: true, coins: 0, hits: 0, time: l5.starTime - 1 })[1]).toBe(true);
    expect(starsFor(l5, { won: true, coins: 999, hits: 0, time: l5.starTime + 1 })[1]).toBe(false);
  });

  it('progress is saved: stars never get lost, levels unlock in order, rewards once', async () => {
    const { SaveData } = await import('../src/services/SaveData.js');
    const { MemoryStorage } = await import('./helpers.js');
    const { getLevel, levelReward } = await import('../src/config/campaign.js');
    const storage = new MemoryStorage();
    const save = new SaveData(storage);
    expect(save.isLevelUnlocked(1)).toBe(true);
    expect(save.isLevelUnlocked(2)).toBe(false);
    const coins0 = save.data.totalCoins;
    const first = save.submitLevel(1, [true, false, true]);
    expect(first.firstClear).toBe(true);
    expect(first.reward).toEqual({ coins: levelReward(getLevel(1)).coins, gems: 2 });
    expect(save.data.totalCoins).toBe(coins0 + first.reward.coins);
    expect(save.isLevelUnlocked(2)).toBe(true);
    const again = save.submitLevel(1, [true, true, false]);
    expect(again.firstClear).toBe(false);
    expect(again.reward).toEqual({ coins: 0, gems: 1 });
    expect(save.levelStars(1)).toEqual([true, true, true]);
    expect(save.totalStars).toBe(3);
    const reloaded = new SaveData(storage);
    expect(reloaded.levelStars(1)).toEqual([true, true, true]);
  });

  it('the autopilot clears the early levels of every zone', async () => {
    const { getLevel } = await import('../src/config/campaign.js');
    for (const id of [1, 4, 7, 10, 14, 23]) {
      const w = new LaneWorld({ rng: createRng(id * 31 + 1), campaign: getLevel(id) });
      const bot = new Autopilot3D(w);
      run(w, 200, () => w.state === 'running' && bot.update(DT));
      expect(w.state, `level ${id}: ${w.deathCause} ${w.goalProgress}`).toBe('won');
    }
  });
});

describe('v5 time attack', () => {
  it('the clock runs down; clocks on the road, kills and near misses add time', () => {
    const w = new LaneWorld({ rng: createRng(4), mode: 'timeAttack' });
    expect(w.timeLeft).toBe(GAME3D.TIME_ATTACK.start);
    w.player.invulnerable = 1e9;
    run(w, 5, () => (w.player.invulnerable = 1e9));
    expect(w.timeLeft).toBeLessThan(GAME3D.TIME_ATTACK.start);
    const before = w.timeLeft;
    w._collect({ type: 'clock', x: 0, y: 0.5, z: 0 });
    expect(w.timeLeft).toBeCloseTo(before + GAME3D.TIME_ATTACK.clock, 5);
    let clocks = 0;
    run(w, 25, (world) => {
      world.player.invulnerable = 1e9;
      clocks = Math.max(clocks, world.entities.filter((e) => e.type === 'clock').length);
    });
    expect(clocks).toBeGreaterThan(0);
  });

  it('time up ends the run; a revive gives some time back', () => {
    const w = new LaneWorld({ rng: createRng(4), mode: 'timeAttack' });
    w.distanceToNext = Infinity;
    w.timeLeft = 0.5;
    run(w, 1);
    expect(w.state).toBe('dead');
    expect(w.deathCause).toBe('time');
    expect(w.revive()).toBe(true);
    expect(w.timeLeft).toBeGreaterThanOrEqual(GAME3D.TIME_ATTACK.reviveTime);
  });

  it('records are saved per mode', async () => {
    const { SaveData } = await import('../src/services/SaveData.js');
    const { MemoryStorage } = await import('./helpers.js');
    const save = new SaveData(new MemoryStorage());
    expect(save.submitTimeAttack({ score: 500, meters: 300 })).toBe(true);
    expect(save.submitTimeAttack({ score: 400, meters: 900 })).toBe(false);
    expect(save.data.timeAttackBest).toEqual({ score: 500, meters: 300 });
  });
});
