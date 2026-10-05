import { describe, expect, it } from 'vitest';
import { createRng } from '../src/logic/rng.js';
import { emptyMissionsState, getMissionDef, MISSION_POOL, missionTarget, Missions } from '../src/logic3d/Missions.js';

const statsWith = (overrides) => ({ drones: 0, walkers: 0, crates: 0, kills: 0, bosses: 0, jumps: 0, slides: 0, coins: 0, meters: 0, score: 0, bestCombo: 0, gems: 0, ...overrides });

describe('Missions', () => {
  it('always keeps three different active missions', () => {
    const m = new Missions(emptyMissionsState(), createRng(1));
    const ids = m.list().map((x) => x.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it('accumulates "total" missions across runs and completes them', () => {
    const state = { active: [{ id: 'drones', progress: 0, target: 8, reward: { coins: 150, gems: 0 } }], completed: 0 };
    const m = new Missions(state, createRng(2));
    expect(m.applyRun(statsWith({ drones: 5 }))).toHaveLength(0);
    const done = m.applyRun(statsWith({ drones: 4 }));
    expect(done.map((d) => d.id)).toEqual(['drones']);
    expect(done[0].reward.coins).toBe(150);
    expect(state.completed).toBe(1);
    expect(m.list()).toHaveLength(3);
    expect(m.list().some((x) => x.id === 'drones')).toBe(false);
  });

  it('"run" missions only count the best single run', () => {
    const state = { active: [{ id: 'coinsRun', progress: 0, target: 120, reward: { coins: 200, gems: 0 } }], completed: 0 };
    const m = new Missions(state, createRng(3));
    m.applyRun(statsWith({ coins: 80 }));
    m.applyRun(statsWith({ coins: 70 }));
    expect(m.list().find((x) => x.id === 'coinsRun').progress).toBe(80);
    expect(m.applyRun(statsWith({ coins: 130 })).map((d) => d.id)).toContain('coinsRun');
  });

  it('applying the same run twice (revive) does not double count', () => {
    const state = { active: [{ id: 'walkers', progress: 0, target: 12, reward: { coins: 150, gems: 0 } }], completed: 0 };
    const m = new Missions(state, createRng(6));
    const first = statsWith({ walkers: 5 });
    m.applyRun(first);
    m.applyRun(statsWith({ walkers: 7 }), first);
    expect(m.list().find((x) => x.id === 'walkers').progress).toBe(7);
  });

  it('targets and rewards grow with the tier', () => {
    const def = getMissionDef('kills');
    expect(missionTarget(def, 2)).toBeGreaterThan(missionTarget(def, 0));
    const m = new Missions({ active: [], completed: 9 }, createRng(4));
    expect(m.tier).toBe(3);
  });

  it('drops unknown missions from old saves', () => {
    const m = new Missions({ active: [{ id: 'gone', progress: 1, target: 2 }], completed: 0 }, createRng(5));
    expect(m.list().every((x) => MISSION_POOL.some((p) => p.id === x.id))).toBe(true);
  });
});
