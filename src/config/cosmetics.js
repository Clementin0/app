/**
 * Shop catalog. Four cosmetic categories (one item equipped per category)
 * plus weapons, which also change how the player shoots.
 * Prices are in coins unless `currency: 'gems'`.
 */

export const CATEGORIES = Object.freeze(['skin', 'hat', 'weapon', 'trail']);

export const SKINS = Object.freeze([
  { id: 'neon', name: 'Neon', price: 0, body: 0x18c8ff, accent: 0x2a5cff, glow: 0x00f5ff },
  { id: 'bubblegum', name: 'Bubblegum', price: 150, body: 0xff5ad9, accent: 0xb81ec4, glow: 0xff2bd6 },
  { id: 'lime', name: 'Lime', price: 300, body: 0x5cf27a, accent: 0x12a86b, glow: 0x39ff88 },
  { id: 'sunset', name: 'Sunset', price: 500, body: 0xff8a3d, accent: 0xff2b6e, glow: 0xff8a3d },
  { id: 'ghost', name: 'Ghost', price: 800, body: 0xe6e2ff, accent: 0x8f86d9, glow: 0xffffff },
  { id: 'lava', name: 'Lava', price: 1200, body: 0xff3860, accent: 0x5a0b1c, glow: 0xffd23f },
  { id: 'gold', name: 'Gold', price: 25, currency: 'gems', body: 0xffc83d, accent: 0xc27a00, glow: 0xffd23f },
  { id: 'galaxy', name: 'Galaxy', price: 60, currency: 'gems', body: 0x5b2bd6, accent: 0x170a45, glow: 0x9d4dff },
]);

export const HATS = Object.freeze([
  { id: 'none', name: { it: 'Nessuno', en: 'None' }, price: 0, color: 0x888888 },
  { id: 'cap', name: { it: 'Cappellino', en: 'Cap' }, price: 200, color: 0xff3860 },
  { id: 'antenna', name: { it: 'Antenna', en: 'Antenna' }, price: 250, color: 0x39ff88 },
  { id: 'headphones', name: { it: 'Cuffie', en: 'Headphones' }, price: 350, color: 0x9d4dff },
  { id: 'horns', name: { it: 'Corna', en: 'Horns' }, price: 500, color: 0xff6a00 },
  { id: 'tophat', name: { it: 'Cilindro', en: 'Top hat' }, price: 700, color: 0x222233 },
  { id: 'crown', name: { it: 'Corona', en: 'Crown' }, price: 30, currency: 'gems', color: 0xffd23f },
  { id: 'halo', name: { it: 'Aureola', en: 'Halo' }, price: 40, currency: 'gems', color: 0xfff3a8 },
]);

export const WEAPONS = Object.freeze([
  { id: 'blaster', name: { it: 'Blaster', en: 'Blaster' }, price: 0, color: 0x00f5ff, descKey: 'weaponBlaster' },
  { id: 'twin', name: { it: 'Doppietta', en: 'Twin' }, price: 600, color: 0x39ff88, descKey: 'weaponTwin' },
  { id: 'spread', name: { it: 'Ventaglio', en: 'Spread' }, price: 1200, color: 0xffd23f, descKey: 'weaponSpread' },
  { id: 'laser', name: { it: 'Laser', en: 'Laser' }, price: 45, currency: 'gems', color: 0xff2bd6, descKey: 'weaponLaser' },
]);

export const TRAILS = Object.freeze([
  { id: 'neon', name: { it: 'Neon', en: 'Neon' }, price: 0, colors: [0x00f5ff, 0x9d4dff] },
  { id: 'fire', name: { it: 'Fuoco', en: 'Fire' }, price: 250, colors: [0xff6a00, 0xffd23f, 0xff3860] },
  { id: 'toxic', name: { it: 'Tossica', en: 'Toxic' }, price: 250, colors: [0x39ff88, 0xb6ff3d] },
  { id: 'ice', name: { it: 'Ghiaccio', en: 'Ice' }, price: 400, colors: [0xffffff, 0x7ff3ff] },
  { id: 'shadow', name: { it: 'Ombra', en: 'Shadow' }, price: 600, colors: [0x9d4dff, 0x2a0b5c] },
  { id: 'rainbow', name: { it: 'Arcobaleno', en: 'Rainbow' }, price: 30, currency: 'gems', colors: [0xff3860, 0xff8a3d, 0xffd23f, 0x39ff88, 0x00f5ff, 0x9d4dff] },
]);

export const CATALOG = Object.freeze({ skin: SKINS, hat: HATS, weapon: WEAPONS, trail: TRAILS });

export const DEFAULT_EQUIPPED = Object.freeze({ skin: 'neon', hat: 'none', weapon: 'blaster', trail: 'neon' });

export function getItem(category, id) {
  const list = CATALOG[category] ?? [];
  return list.find((i) => i.id === id) ?? null;
}

/** Localized display name of a catalog item. */
export function itemName(item, lang = 'it') {
  if (!item) return '';
  return typeof item.name === 'string' ? item.name : (item.name[lang] ?? item.name.en);
}

export const currencyOf = (item) => (item.currency === 'gems' ? 'gems' : 'coins');

/** Coins granted by the shop's rewarded video, and its cooldown. */
export const FREE_COINS = Object.freeze({ amount: 50, cooldownMs: 3 * 60 * 1000 });
