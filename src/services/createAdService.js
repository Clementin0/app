import { Capacitor } from '@capacitor/core';
import { AdMob } from '@capacitor-community/admob';
import admobConfig from '../config/admob.config.js';
import { AdService } from './AdService.js';
import { MockAdMob } from './MockAdMob.js';

/**
 * Real AdMob plugin on Android/iOS, DOM mock in the browser.
 * `fastMock` shortens and auto-closes mock ads (automated verification).
 */
export function createAdService({ fastMock = false } = {}) {
  const native = Capacitor.isNativePlatform();
  const plugin = native
    ? AdMob
    : new MockAdMob({ autoClose: fastMock, durations: fastMock ? { interstitial: 400, rewarded: 500 } : {}, loadDelayMs: fastMock ? 50 : 250 });
  return new AdService({ plugin, config: admobConfig });
}
