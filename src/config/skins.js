/**
 * Character skins sold in the shop. Coins and gems collected while running
 * are spent here, giving the currency a purpose (retention).
 *
 * body: top / middle / bottom gradient colors, glow: outline glow,
 * trail: particle tints behind the runner.
 */
export const SKINS = Object.freeze([
  { id: 'neon', name: 'Neon', price: 0, currency: 'coins', body: ['#5ffbff', '#00c8ff', '#2a5cff'], glow: '#00f5ff', trail: [0x00f5ff, 0x9d4dff] },
  { id: 'bubblegum', name: 'Bubblegum', price: 150, currency: 'coins', body: ['#ffc2f3', '#ff5ad9', '#b81ec4'], glow: '#ff2bd6', trail: [0xff2bd6, 0xffc2f3] },
  { id: 'lime', name: 'Lime', price: 300, currency: 'coins', body: ['#d9ffb3', '#5cf27a', '#12a86b'], glow: '#39ff88', trail: [0x39ff88, 0xd9ffb3] },
  { id: 'sunset', name: 'Sunset', price: 500, currency: 'coins', body: ['#ffe86b', '#ff8a3d', '#ff2b6e'], glow: '#ff8a3d', trail: [0xffd23f, 0xff2b6e] },
  { id: 'ghost', name: 'Ghost', price: 800, currency: 'coins', body: ['#ffffff', '#d8d2ff', '#8f86d9'], glow: '#ffffff', trail: [0xffffff, 0xb9b0ff] },
  { id: 'lava', name: 'Lava', price: 1200, currency: 'coins', body: ['#ffd23f', '#ff3860', '#5a0b1c'], glow: '#ff3860', trail: [0xff3860, 0xffd23f] },
  { id: 'gold', name: 'Gold', price: 25, currency: 'gems', body: ['#fff3a8', '#ffc83d', '#c27a00'], glow: '#ffd23f', trail: [0xffd23f, 0xffffff] },
  { id: 'galaxy', name: 'Galaxy', price: 60, currency: 'gems', body: ['#b18cff', '#5b2bd6', '#170a45'], glow: '#9d4dff', trail: [0x9d4dff, 0x00f5ff, 0xff2bd6], stars: true },
]);

export const DEFAULT_SKIN = SKINS[0].id;

export function getSkin(id) {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

/** Texture key of a skin's runner sprite. */
export const skinTextureKey = (id) => `player_${getSkin(id).id}`;

/** Coins granted by the shop's rewarded video, and its cooldown. */
export const FREE_COINS = Object.freeze({ amount: 50, cooldownMs: 3 * 60 * 1000 });
