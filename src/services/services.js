/**
 * Shared singletons (save data, audio, haptics, ads), created once in main.js and
 * read by the scenes.
 */
export const services = {
  /** @type {import('./SaveData.js').SaveData} */
  save: null,
  /** @type {import('./Sfx.js').Sfx} */
  sfx: null,
  /** @type {import('./Music.js').Music} */
  music: null,
  /** @type {import('./Haptics.js').Haptics} */
  haptics: null,
  /** @type {import('./AdService.js').AdService} */
  ads: null,
  /** @type {import('../three/Stage.js').Stage} */
  stage: null,
};
