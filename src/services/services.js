/**
 * Shared singletons (save data, audio, ads), created once in main.js and
 * read by the scenes.
 */
export const services = {
  /** @type {import('./SaveData.js').SaveData} */
  save: null,
  /** @type {import('./Sfx.js').Sfx} */
  sfx: null,
  /** @type {import('./AdService.js').AdService} */
  ads: null,
};
