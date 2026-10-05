/**
 * Minimal localization: Italian and English. The language follows the
 * device (navigator.language) unless the player picks one in the settings.
 */

export const STRINGS = {
  it: {
    play: 'GIOCA',
    tagline: 'Corri. Salta. Non fermarti.',
    record: 'RECORD',
    recordValue: 'RECORD {n}',
    go: 'VIA!',
    speedUp: 'VELOCITÀ +',
    newRecord: 'NUOVO RECORD!',
    gameOver: 'GAME OVER',
    hint: 'TOCCA per saltare  •  TIENI PREMUTO per saltare più in alto  •  TOCCA in aria per il DOPPIO SALTO',
    shield: 'SCUDO!',
    magnet: 'MAGNETE!',
    pause: 'PAUSA',
    resume: 'RIPRENDI',
    restart: 'RICOMINCIA',
    menu: 'MENU',
    retry: 'RIGIOCA',
    continue: 'CONTINUA',
    watchVideo: 'Guarda un video',
    loadingVideo: 'Caricamento video...',
    watchToEnd: 'Guarda il video fino alla fine per continuare',
    videoUnavailable: 'Video non disponibile, riprova tra poco',
    shop: 'NEGOZIO',
    equip: 'USA',
    equipped: 'IN USO',
    notEnough: 'Non hai abbastanza {currency}',
    coins: 'monete',
    gems: 'gemme',
    unlocked: '{name} sbloccato!',
    freeCoins: '+{n} GRATIS',
    freeCoinsWait: 'Disponibile tra {t}',
    rewardCoins: '+{n} monete!',
    settings: 'IMPOSTAZIONI',
    music: 'Musica',
    sfx: 'Effetti sonori',
    vibration: 'Vibrazione',
    language: 'Lingua',
    privacy: 'Privacy e consenso',
    on: 'ON',
    off: 'OFF',
    close: 'CHIUDI',
    best: 'MIGLIORE',
    distance: 'Distanza',
    rotate: 'Ruota il dispositivo in orizzontale',
  },
  en: {
    play: 'PLAY',
    tagline: 'Run. Jump. Never stop.',
    record: 'BEST',
    recordValue: 'BEST {n}',
    go: 'GO!',
    speedUp: 'SPEED UP',
    newRecord: 'NEW RECORD!',
    gameOver: 'GAME OVER',
    hint: 'TAP to jump  •  HOLD to jump higher  •  TAP in the air to DOUBLE JUMP',
    shield: 'SHIELD!',
    magnet: 'MAGNET!',
    pause: 'PAUSED',
    resume: 'RESUME',
    restart: 'RESTART',
    menu: 'MENU',
    retry: 'RETRY',
    continue: 'CONTINUE',
    watchVideo: 'Watch a video',
    loadingVideo: 'Loading video...',
    watchToEnd: 'Watch the whole video to continue',
    videoUnavailable: 'Video unavailable, try again soon',
    shop: 'SHOP',
    equip: 'USE',
    equipped: 'EQUIPPED',
    notEnough: 'Not enough {currency}',
    coins: 'coins',
    gems: 'gems',
    unlocked: '{name} unlocked!',
    freeCoins: '+{n} FREE',
    freeCoinsWait: 'Available in {t}',
    rewardCoins: '+{n} coins!',
    settings: 'SETTINGS',
    music: 'Music',
    sfx: 'Sound effects',
    vibration: 'Vibration',
    language: 'Language',
    privacy: 'Privacy & consent',
    on: 'ON',
    off: 'OFF',
    close: 'CLOSE',
    best: 'BEST',
    distance: 'Distance',
    rotate: 'Rotate your device to landscape',
  },
};

export const LANGUAGES = Object.keys(STRINGS);

export function detectLanguage(nav = globalThis.navigator) {
  const list = [...(nav?.languages ?? []), nav?.language].filter(Boolean);
  for (const tag of list) {
    const code = String(tag).slice(0, 2).toLowerCase();
    if (STRINGS[code]) return code;
  }
  return 'en';
}

let current = detectLanguage();

export function setLanguage(lang) {
  if (STRINGS[lang]) current = lang;
  return current;
}

export function getLanguage() {
  return current;
}

/** Translated string; `{name}` placeholders are filled from `params`. */
export function t(key, params = {}) {
  const template = STRINGS[current][key] ?? STRINGS.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

/** Number with the thousands separator of the current language. */
export function fmt(n) {
  return Math.floor(n).toLocaleString(current === 'it' ? 'it-IT' : 'en-US');
}
