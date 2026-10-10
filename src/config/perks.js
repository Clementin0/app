/**
 * Perks offered after every boss (pick 1 of 3). They last for the rest of
 * the run and stack up to `max`, so every run builds differently.
 */
export const PERKS = Object.freeze([
  { id: 'heart', max: 3, color: 0xff3860 }, // +1 max heart, heals one
  { id: 'damage', max: 4, color: 0xff8a3d }, // +25% damage per level
  { id: 'fireRate', max: 4, color: 0xffd23f }, // -12% fire interval per level
  { id: 'pierce', max: 1, color: 0xff2bd6 }, // shots go through enemies
  { id: 'multishot', max: 1, color: 0x39ff88 }, // two extra angled shots
  { id: 'magnet', max: 1, color: 0xff5a5a }, // a small permanent magnet
  { id: 'shieldRegen', max: 1, color: 0x39ff88 }, // the shield comes back 25 s after breaking
  { id: 'coins', max: 2, color: 0xffd23f }, // +50% chance of a double coin per level
  { id: 'explosive', max: 1, color: 0xff6a00 }, // kills blow up nearby enemies
  { id: 'combo', max: 1, color: 0xffb347 }, // longer combo window, combo up to x12
  { id: 'slowmo', max: 1, color: 0x7ff3ff }, // top speed -12%
  { id: 'vampire', max: 1, color: 0xb81ec4 }, // every 20 kills heals a heart
  { id: 'lucky', max: 1, color: 0x9d4dff }, // power-ups more often and longer
]);

export const getPerk = (id) => PERKS.find((p) => p.id === id) ?? null;

export const PERK_TUNING = Object.freeze({
  damagePerLevel: 0.25,
  fireRatePerLevel: 0.88,
  magnetRadius: 6,
  shieldRegen: 25,
  explosionRadius: 3.2,
  explosionDamage: 2,
  comboWindow: 1.6,
  comboMax: 12,
  slowmo: 0.88,
  vampireKills: 20,
  luckyEvery: 0.65,
  luckyDuration: 1.3,
});
