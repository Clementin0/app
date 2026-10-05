/**
 * AdMob configuration.
 *
 * This is the ONLY file that contains AdMob identifiers. Everything else
 * (AdService, the Android manifest patch script, the tests) reads from here.
 *
 * Development: the official Google test IDs are used
 * (https://developers.google.com/admob/android/test-ads). They always serve
 * test ads and never generate invalid traffic.
 *
 * Release:
 *   1. Create the app and the three ad units in the AdMob console.
 *   2. Paste the IDs in PRODUCTION_IDS below.
 *   3. Set USE_TEST_ADS = false.
 *   4. Run `npm run cap:sync`: it also writes the App ID in AndroidManifest.xml.
 */

/** Official Google AdMob test IDs for Android. */
export const TEST_IDS = Object.freeze({
  appId: 'ca-app-pub-3940256099942544~3347511713',
  banner: 'ca-app-pub-3940256099942544/9214589741', // Adaptive banner
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
});

/** Your real IDs (placeholders until you create them in the AdMob console). */
export const PRODUCTION_IDS = Object.freeze({
  appId: 'ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX',
  banner: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',
  interstitial: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',
  rewarded: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',
});

/** Switch to `false` only for the release build, once PRODUCTION_IDS are real. */
export const USE_TEST_ADS = true;

const PLACEHOLDER = /X{6,}/;

/** True when every production ID has been filled in. */
export function hasRealProductionIds(ids = PRODUCTION_IDS) {
  return Object.values(ids).every((id) => typeof id === 'string' && id.startsWith('ca-app-pub-') && !PLACEHOLDER.test(id));
}

/**
 * Picks the IDs to use. Falls back to the test IDs when production is
 * requested but the placeholders were never replaced, so a misconfigured
 * build can never request ads with an invalid unit ID.
 */
export function resolveAdIds(useTestAds = USE_TEST_ADS, productionIds = PRODUCTION_IDS) {
  if (useTestAds) return { ids: TEST_IDS, testing: true };
  if (!hasRealProductionIds(productionIds)) {
    return { ids: TEST_IDS, testing: true, warning: 'PRODUCTION_IDS are placeholders: falling back to AdMob test IDs.' };
  }
  return { ids: productionIds, testing: false };
}

const resolved = resolveAdIds();

const admobConfig = Object.freeze({
  ids: resolved.ids,
  /** Passed as `isTesting` / `initializeForTesting` to the plugin. */
  testing: resolved.testing,
  warning: resolved.warning ?? null,
  /** Hashed device IDs that should always receive test ads (see Logcat on first run). */
  testingDevices: [],

  /** An interstitial is shown every N completed games (game over -> Retry/Menu). */
  interstitialEveryNGames: 3,

  banner: {
    adSize: 'ADAPTIVE_BANNER',
    position: 'BOTTOM_CENTER',
    margin: 0,
    /** Space reserved for the banner before the real size is known (dp). */
    defaultHeightDp: 56,
  },

  /** Google UMP consent flow (GDPR / EEA). Required to serve ads in Italy/EU. */
  consent: {
    enabled: true,
    /** For testing only: 1 = force EEA, 0/null = real geography. */
    debugGeography: null,
  },

  /** Safety timeout: a full-screen ad that never reports back is treated as closed. */
  fullscreenTimeoutMs: 90_000,
  /** Delay before retrying a failed ad load. */
  retryLoadDelayMs: 15_000,

  tagForChildDirectedTreatment: false,
  tagForUnderAgeOfConsent: false,
  maxAdContentRating: 'General',
});

export default admobConfig;
