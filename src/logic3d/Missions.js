/**
 * Missions: three active goals with coin/gem rewards. "total" missions
 * accumulate across runs, "run" missions must be achieved in one run.
 * Completed missions are replaced; targets grow with every three missions
 * completed (tier), so goals keep pace with the player.
 */

export const MISSION_POOL = Object.freeze([
  { id: 'drones', stat: 'drones', scope: 'total', base: 8, reward: { coins: 150 } },
  { id: 'walkers', stat: 'walkers', scope: 'total', base: 12, reward: { coins: 150 } },
  { id: 'crates', stat: 'crates', scope: 'total', base: 15, reward: { coins: 120 } },
  { id: 'kills', stat: 'kills', scope: 'total', base: 40, reward: { coins: 300 } },
  { id: 'bosses', stat: 'bosses', scope: 'total', base: 1, reward: { gems: 3 } },
  { id: 'jumps', stat: 'jumps', scope: 'total', base: 40, reward: { coins: 100 } },
  { id: 'slides', stat: 'slides', scope: 'total', base: 30, reward: { coins: 100 } },
  { id: 'coinsRun', stat: 'coins', scope: 'run', base: 120, reward: { coins: 200 } },
  { id: 'metersRun', stat: 'meters', scope: 'run', base: 900, reward: { coins: 200 } },
  { id: 'scoreRun', stat: 'score', scope: 'run', base: 4000, reward: { coins: 250 } },
  { id: 'comboRun', stat: 'bestCombo', scope: 'run', base: 4, reward: { coins: 150 } },
  { id: 'gemsRun', stat: 'gems', scope: 'run', base: 2, reward: { gems: 2 } },
  { id: 'chargers', stat: 'chargers', scope: 'total', base: 6, reward: { coins: 180 } },
  { id: 'events', stat: 'events', scope: 'total', base: 4, reward: { coins: 200 } },
]);

const ACTIVE = 3;

export const getMissionDef = (id) => MISSION_POOL.find((m) => m.id === id) ?? null;

/** Target of a mission at a given tier. */
export function missionTarget(def, tier) {
  const t = def.base * (1 + 0.5 * tier);
  return def.base <= 5 ? Math.max(def.base, Math.round(t)) : Math.round(t / 5) * 5;
}

export function missionReward(def, tier) {
  const scale = 1 + 0.25 * tier;
  return { coins: Math.round((def.reward.coins ?? 0) * scale), gems: Math.round((def.reward.gems ?? 0) * scale) };
}

export function emptyMissionsState() {
  return { active: [], completed: 0 };
}

export class Missions {
  /** @param state persisted object { active: [{id, progress}], completed } (mutated in place) */
  constructor(state, rng = { int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)) }) {
    this.state = state ?? emptyMissionsState();
    this.rng = rng;
    this.state.active = (this.state.active ?? []).filter((m) => getMissionDef(m.id));
    this.state.completed = Number.isFinite(this.state.completed) ? this.state.completed : 0;
    this.fill();
  }

  get tier() {
    return Math.floor(this.state.completed / ACTIVE);
  }

  fill() {
    while (this.state.active.length < ACTIVE) {
      const used = new Set(this.state.active.map((m) => m.id));
      const free = MISSION_POOL.filter((m) => !used.has(m.id));
      const def = free[this.rng.int(0, free.length - 1)];
      this.state.active.push({ id: def.id, progress: 0, target: missionTarget(def, this.tier), reward: missionReward(def, this.tier) });
    }
  }

  /** Rich view for the UI. */
  list() {
    return this.state.active.map((m) => ({ ...m, def: getMissionDef(m.id), done: m.progress >= m.target }));
  }

  /**
   * Applies the stats of a run. `previous` holds the stats already applied
   * for the same run (after a revive the run is applied again): "total"
   * missions only add the difference. Returns the missions completed (with
   * their rewards) and refills the active list.
   */
  applyRun(stats, previous = {}) {
    const completed = [];
    for (const m of this.state.active) {
      const def = getMissionDef(m.id);
      const value = Math.max(0, Math.floor(stats[def.stat] ?? 0));
      const already = def.scope === 'total' ? Math.max(0, Math.floor(previous[def.stat] ?? 0)) : 0;
      m.progress = def.scope === 'total' ? m.progress + Math.max(0, value - already) : Math.max(m.progress, value);
      if (m.progress >= m.target) {
        m.progress = m.target;
        completed.push({ ...m, def });
      }
    }
    if (completed.length) {
      this.state.active = this.state.active.filter((m) => m.progress < m.target);
      this.state.completed += completed.length;
      this.fill();
    }
    return completed;
  }
}
