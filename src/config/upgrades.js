/**
 * Permanent upgrades bought with coins: they carry over between runs and
 * give long-term progression. Levels are stored in SaveData.
 */
export const UPGRADES = Object.freeze([
  { id: 'damage', nameKey: 'upDamage', descKey: 'upDamageDesc', costs: [150, 320, 650, 1100, 1800] },
  { id: 'fireRate', nameKey: 'upFireRate', descKey: 'upFireRateDesc', costs: [150, 320, 650, 1100, 1800] },
  { id: 'magnet', nameKey: 'upMagnet', descKey: 'upMagnetDesc', costs: [100, 220, 450, 800, 1300] },
  { id: 'hp', nameKey: 'upHp', descKey: 'upHpDesc', costs: [900, 2200] },
  { id: 'startShield', nameKey: 'upShield', descKey: 'upShieldDesc', costs: [1500] },
]);

export const getUpgrade = (id) => UPGRADES.find((u) => u.id === id) ?? null;

export const maxLevel = (id) => getUpgrade(id)?.costs.length ?? 0;

/** Cost of the next level, or null when maxed. */
export function nextCost(id, level) {
  const u = getUpgrade(id);
  if (!u || level >= u.costs.length) return null;
  return u.costs[level];
}

/** Loadout for LaneWorld from the equipped weapon and the upgrade levels. */
export function loadoutFrom({ equipped, upgrades }) {
  return {
    weapon: equipped?.weapon ?? 'blaster',
    damageLevel: upgrades?.damage ?? 0,
    fireRateLevel: upgrades?.fireRate ?? 0,
    magnetLevel: upgrades?.magnet ?? 0,
    hpLevel: upgrades?.hp ?? 0,
    startShield: (upgrades?.startShield ?? 0) > 0,
  };
}
