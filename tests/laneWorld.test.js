import { describe, expect, it } from 'vitest';
import { GAME3D, laneX, PLAYER } from '../src/config/game3d.config.js';
import { createRng } from '../src/logic/rng.js';
import { Autopilot3D } from '../src/logic3d/Autopilot3D.js';
import { LaneWorld } from '../src/logic3d/LaneWorld.js';

const DT = 1 / 60;

/** World without random rows, so each test places exactly what it needs. */
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
const types = (w) => w.drainEvents().map((e) => e.type);

describe('LaneWorld - movement', () => {
  it('starts in the middle lane, running, with full hearts', () => {
    const w = quietWorld();
    expect(w.player.lane).toBe(1);
    expect(w.state).toBe('running');
    expect(w.player.hp).toBe(PLAYER.baseHp);
  });

  it('switches lanes smoothly and stops at the edges', () => {
    const w = quietWorld();
    expect(w.moveLeft()).toBe(true);
    run(w, 0.3);
    expect(w.player.x).toBeCloseTo(laneX(0));
    expect(w.moveLeft()).toBe(false);
    expect(types(w)).toContain('bump');
    w.moveRight();
    w.moveRight();
    run(w, 0.5);
    expect(w.player.lane).toBe(2);
    expect(w.player.x).toBeCloseTo(laneX(2));
  });

  it('jumps about 1.9 m high and lands back', () => {
    const w = quietWorld();
    expect(w.jump()).toBe(true);
    let apex = 0;
    run(w, 1, () => (apex = Math.max(apex, w.player.y)));
    expect(apex).toBeGreaterThan(1.85);
    expect(w.player.grounded).toBe(true);
  });

  it('slides with a low hitbox, and a swipe down in the air slams then slides', () => {
    const w = quietWorld();
    w.slide();
    expect(w.playerBox().y1).toBeCloseTo(PLAYER.slideHeight);
    run(w, 1);
    expect(w.player.slide).toBe(0);
    w.jump();
    run(w, 0.15);
    w.slide();
    run(w, 0.25);
    expect(w.player.grounded).toBe(true);
    expect(w.player.slide).toBeGreaterThan(0);
  });

  it('cannot move sideways into the flank of a wall', () => {
    const w = quietWorld();
    place(w, { type: 'wall', lane: 0 }, 0);
    expect(w.moveLeft()).toBe(false);
    expect(w.player.lane).toBe(1);
  });
});

describe('LaneWorld - obstacles', () => {
  it('barriers must be jumped', () => {
    const crash = quietWorld();
    place(crash, { type: 'barrier' }, 10);
    run(crash, 1.5);
    expect(crash.deathCause).toBe('barrier');

    const ok = quietWorld();
    place(ok, { type: 'barrier' }, 10);
    run(ok, 1.5, (w) => {
      if (w.entities[0] && w.entities[0].z < 3 && w.player.grounded) w.jump();
    });
    expect(ok.state).toBe('running');
  });

  it('beams must be slid under', () => {
    const crash = quietWorld();
    place(crash, { type: 'beam' }, 10);
    run(crash, 1.5);
    expect(crash.deathCause).toBe('beam');

    const ok = quietWorld();
    place(ok, { type: 'beam' }, 10);
    run(ok, 1.5, (w) => {
      if (w.entities[0] && w.entities[0].z < 4 && w.player.slide === 0) w.slide();
    });
    expect(ok.state).toBe('running');
  });

  it('walls are lethal; a shield absorbs one crash', () => {
    const crash = quietWorld();
    place(crash, { type: 'wall' }, 8);
    run(crash, 1);
    expect(crash.deathCause).toBe('wall');

    const shielded = quietWorld({ loadout: { startShield: true } });
    place(shielded, { type: 'wall' }, 8);
    run(shielded, 1.5);
    expect(shielded.state).toBe('running');
    expect(shielded.player.shield).toBe(false);
  });

  it('platforms can be jumped onto and run across', () => {
    const w = quietWorld();
    place(w, { type: 'platform', length: 12 }, 12);
    let maxSurface = 0;
    run(w, 2.5, (world) => {
      const plat = world.entities.find((e) => e.type === 'platform');
      if (plat && plat.z - plat.d / 2 < 3.5 && world.player.grounded && world.player.y === 0) world.jump();
      maxSurface = Math.max(maxSurface, world.player.surface);
    });
    expect(w.state).toBe('running');
    expect(maxSurface).toBeCloseTo(GAME3D.OBSTACLES.platform.h);
  });
});

describe('LaneWorld - shooting and enemies', () => {
  it('shots destroy a crate, score points and drop coins', () => {
    const w = quietWorld();
    place(w, { type: 'crate' }, 40);
    w.setFiring(true);
    run(w, 1);
    const ev = types(w);
    expect(ev).toContain('shoot');
    expect(ev).toContain('kill');
    expect(w.stats.crates).toBe(1);
    expect(w.score.bonus).toBeGreaterThan(0);
    expect(w.entities.some((e) => e.type === 'coin')).toBe(true);
  });

  it('walkers cost a heart on contact when not shot down', () => {
    const w = quietWorld();
    place(w, { type: 'walker' }, 20);
    run(w, 1.5);
    expect(w.player.hp).toBe(PLAYER.baseHp - 1);
    expect(w.state).toBe('running');
    expect(types(w)).toContain('hurt');
  });

  it('kills in a row build a combo multiplier', () => {
    const w = quietWorld();
    for (let i = 0; i < 3; i++) place(w, { type: 'crate' }, 30 + i * 6);
    w.setFiring(true);
    run(w, 2);
    expect(w.combo.best).toBe(3);
    expect(types(w)).toContain('combo');
  });

  it('drones hold position, fire plasma and can be shot down', () => {
    const w = quietWorld();
    place(w, { type: 'drone', lane: 0 }, 60);
    let fired = false;
    run(w, 6, (world) => {
      if (world.eshots.length) fired = true;
    });
    const drone = w.entities.find((e) => e.type === 'drone');
    expect(drone.state).toBe('hold');
    expect(fired).toBe(true);

    // Line up with it and shoot.
    w.player.lane = drone.targetLane;
    w.player.x = laneX(drone.targetLane);
    drone.x = laneX(drone.targetLane);
    drone.hopTimer = 99;
    w.player.invulnerable = 99;
    w.setFiring(true);
    run(w, 2);
    expect(w.stats.drones).toBe(1);
  });

  it('enemy plasma costs a heart; three hits end the run', () => {
    const w = quietWorld();
    for (let i = 0; i < 3; i++) {
      w._enemyShot(w.player.x, 10, 'test');
      run(w, 1.4);
    }
    expect(w.player.hp).toBe(0);
    expect(w.state).toBe('dead');
    expect(w.deathCause).toBe('plasma');
  });

  it('sliding ducks under plasma, and shots can destroy it', () => {
    const duck = quietWorld();
    duck._enemyShot(duck.player.x, 8, 'test');
    duck.slide();
    run(duck, 0.6);
    expect(duck.player.hp).toBe(PLAYER.baseHp);

    const shoot = quietWorld();
    shoot._enemyShot(shoot.player.x, 30, 'test');
    shoot.setFiring(true);
    run(shoot, 1);
    expect(shoot.player.hp).toBe(PLAYER.baseHp);
    expect(types(shoot)).toContain('plasmaDestroyed');
  });

  it('weapons change the shot pattern; upgrades raise damage and fire rate', () => {
    const shotsFired = (loadout) => {
      const w = quietWorld({ loadout });
      w.setFiring(true);
      run(w, 1);
      return w.shots.length + w.drainEvents().filter((e) => e.type === 'shoot').length * 0;
    };
    const w = quietWorld({ loadout: { weapon: 'spread' } });
    w.fire();
    w.step(DT);
    expect(w.shots).toHaveLength(3);
    const twin = quietWorld({ loadout: { weapon: 'twin' } });
    twin.fire();
    twin.step(DT);
    expect(twin.shots).toHaveLength(2);

    const base = quietWorld().weaponStats;
    const upgraded = quietWorld({ loadout: { damageLevel: 2, fireRateLevel: 3 } }).weaponStats;
    expect(upgraded.damage).toBeGreaterThan(base.damage);
    expect(upgraded.interval).toBeLessThan(base.interval);
    expect(shotsFired({})).toBeGreaterThan(0);
  });
});

describe('LaneWorld - boss and zones', () => {
  it('a boss arrives at the end of the zone; defeating it rewards and changes zone', () => {
    const w = quietWorld();
    w.distance = GAME3D.ZONES.bossAt + 1;
    w.step(DT);
    expect(w.boss).not.toBeNull();
    expect(types(w)).toContain('bossSpawn');
    w.player.invulnerable = 999;
    w.setFiring(true);
    run(w, 30, (world) => {
      if (world.boss) {
        world.player.x = world.boss.x;
      }
    });
    expect(w.boss).toBeNull();
    expect(w.stats.bosses).toBe(1);
    expect(w.zone.index).toBe(1);
    expect(w.score.gems).toBeGreaterThanOrEqual(3);
  });

  it('an undefeated boss leaves after its time limit and the zone still advances', () => {
    const w = quietWorld();
    w.distance = GAME3D.ZONES.bossAt + 1;
    w.player.invulnerable = 1e9;
    run(w, GAME3D.BOSS.timeLimit + 6);
    expect(types(w)).toContain('bossFled');
    expect(w.zone.index).toBe(1);
  });
});

describe('LaneWorld - boss types', () => {
  /** World in zone `index`, at the moment its boss arrives. */
  function bossWorld(index, seed = 3) {
    const w = quietWorld({ seed });
    w.zone.index = index;
    w.distance = GAME3D.ZONES.bossAt + 1;
    w.step(DT);
    return w;
  }

  it('each zone has its own boss, cycling after the sixth', () => {
    expect(GAME3D.BOSS_KINDS.map((k) => k.id)).toEqual(['mothership', 'scorpion', 'carrier', 'overlord', 'kraken', 'core']);
    for (let zone = 0; zone < 8; zone++) {
      const w = bossWorld(zone);
      expect(w.boss.bossKind).toBe(GAME3D.BOSS_KINDS[zone % 6].id);
      expect(w.hud().boss.kind).toBe(w.boss.bossKind);
      expect(w.drainEvents().find((e) => e.type === 'bossSpawn').bossKind).toBe(w.boss.bossKind);
    }
  });

  it('the scorpion drops mines on one or two lanes, never all three', () => {
    const w = bossWorld(1);
    w.player.invulnerable = 1e9;
    const drops = [];
    run(w, 30, (world) => {
      for (const e of world.drainEvents()) if (e.type === 'bossDrop') drops.push(e.lanes);
    });
    expect(drops.length).toBeGreaterThan(2);
    for (const lanes of drops) {
      expect(lanes.length).toBeGreaterThanOrEqual(1);
      expect(lanes.length).toBeLessThanOrEqual(2);
    }
  });

  it('mines can be shot (no kill count) and cost a heart on contact', () => {
    const w = quietWorld();
    const mine = place(w, { type: 'mine', lane: 1 }, 25);
    w.setFiring(true);
    run(w, 1);
    expect(mine.dead).toBe(true);
    expect(w.stats.kills).toBe(0);
    expect(w.score.bonus).toBeGreaterThan(0);

    const w2 = quietWorld();
    place(w2, { type: 'mine', lane: 1 }, 6);
    run(w2, 1);
    expect(w2.player.hp).toBe(PLAYER.baseHp - 1);
    expect(types(w2)).toContain('smash');
  });

  it('the carrier summons at most a couple of drones at a time', () => {
    const w = bossWorld(2);
    w.player.invulnerable = 1e9;
    let summons = 0;
    let maxDrones = 0;
    run(w, 30, (world) => {
      for (const e of world.drainEvents()) if (e.type === 'bossSummon') summons += 1;
      maxDrones = Math.max(maxDrones, world.entities.filter((e) => e.type === 'drone' && !e.dead).length);
    });
    expect(summons).toBeGreaterThan(0);
    expect(maxDrones).toBeLessThanOrEqual(2);
  });

  it('the overlord sweeps shots lane after lane', () => {
    const w = bossWorld(3);
    w.player.invulnerable = 1e9;
    let sweeps = 0;
    const shotLanes = [];
    run(w, 20, (world) => {
      for (const e of world.drainEvents()) {
        if (e.type === 'bossSweep') sweeps += 1;
        if (e.type === 'enemyShot' && sweeps === 1 && shotLanes.length < 3) shotLanes.push(Math.round(e.x / GAME3D.LANES.width) + 1);
      }
    });
    expect(sweeps).toBeGreaterThan(0);
    expect([[0, 1, 2], [2, 1, 0]]).toContainEqual(shotLanes);
  });

  it('the autopilot survives every boss type on several seeds', () => {
    for (let zone = 0; zone < 6; zone++) {
      for (let seed = 1; seed <= 4; seed++) {
        const w = bossWorld(zone, seed);
        const bot = new Autopilot3D(w);
        run(w, 60, () => {
          bot.update(DT);
          w.drainEvents();
        });
        const name = `${GAME3D.BOSS_KINDS[zone].id} seed ${seed}: ${w.deathCause}`;
        expect(w.state, name).toBe('running');
        expect(w.zone.index, name).toBe(zone + 1);
      }
    }
  });
});

describe('LaneWorld - pickups, score and revive', () => {
  it('collects coins, gems and power-ups', () => {
    const w = quietWorld();
    place(w, { type: 'coin' }, 4);
    place(w, { type: 'gem' }, 6);
    place(w, { type: 'magnet' }, 8);
    place(w, { type: 'double' }, 10);
    run(w, 1);
    expect(w.score.coins).toBe(1);
    expect(w.score.gems).toBe(1);
    expect(w.player.magnet).toBeGreaterThan(0);
    expect(w.player.double).toBeGreaterThan(0);
  });

  it('hearts heal up to the maximum', () => {
    const w = quietWorld({ loadout: { hpLevel: 1 } });
    expect(w.maxHp).toBe(PLAYER.baseHp + 1);
    w.player.hp = 1;
    place(w, { type: 'heart' }, 4);
    run(w, 0.5);
    expect(w.player.hp).toBe(2);
  });

  it('score grows with distance', () => {
    const w = quietWorld();
    run(w, 2);
    expect(w.score.score).toBeGreaterThan(20);
  });

  it('revives once with full hearts and clears nearby threats', () => {
    const w = quietWorld();
    place(w, { type: 'wall' }, 5);
    place(w, { type: 'wall' }, 30);
    run(w, 1);
    expect(w.state).toBe('dead');
    expect(w.revive()).toBe(true);
    expect(w.player.hp).toBe(w.maxHp);
    expect(w.entities.filter((e) => e.type === 'wall')).toHaveLength(0);
    run(w, 1);
    expect(w.state).toBe('running');
    w._die('test');
    expect(w.revive()).toBe(false);
  });
});

describe('LaneWorld - long runs', () => {
  it('the autopilot survives 3 minutes on 12 seeds, crossing zones and beating bosses', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = new LaneWorld({ rng: createRng(seed) });
      const bot = new Autopilot3D(w);
      run(w, 180, () => {
        bot.update(DT);
        w.drainEvents();
      });
      expect(w.state, `seed ${seed}: ${w.deathCause}`).toBe('running');
      expect(w.zone.index).toBeGreaterThanOrEqual(2);
      expect(w.stats.bosses + w.stats.kills).toBeGreaterThan(5);
    }
  });

  it('random input for 3 minutes never throws and keeps entity counts bounded', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const rng = createRng(seed * 31);
      const w = new LaneWorld({ rng: createRng(seed) });
      let maxEntities = 0;
      run(w, 180, (world) => {
        if (world.state === 'dead') {
          if (world.canRevive) world.revive();
          else world.reset();
        }
        const r = rng.next();
        if (r < 0.02) world.moveLeft();
        else if (r < 0.04) world.moveRight();
        else if (r < 0.05) world.jump();
        else if (r < 0.06) world.slide();
        world.setFiring(rng.chance(0.5));
        world.drainEvents();
        maxEntities = Math.max(maxEntities, world.entities.length + world.shots.length + world.eshots.length);
      });
      expect(Number.isFinite(w.score.score)).toBe(true);
      expect(maxEntities).toBeLessThan(400);
    }
  });
});
