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
