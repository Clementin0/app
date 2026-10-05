import { AdmobConsentStatus, BannerAdPluginEvents, InterstitialAdPluginEvents, RewardAdPluginEvents } from '@capacitor-community/admob';
// Not re-exported by the package index.
import { PrivacyOptionsRequirementStatus as PluginPrivacy } from '@capacitor-community/admob/dist/esm/consent/privacy-options-requirement-status.enum.js';
import { describe, expect, it } from 'vitest';
import { BannerEvents, ConsentStatus, InterstitialEvents, PrivacyOptionsRequirementStatus, RewardEvents } from '../src/services/adEvents.js';

describe('adEvents mirrors @capacitor-community/admob', () => {
  it('uses the plugin event names', () => {
    for (const [k, v] of Object.entries(BannerEvents)) expect(BannerAdPluginEvents[k]).toBe(v);
    for (const [k, v] of Object.entries(InterstitialEvents)) expect(InterstitialAdPluginEvents[k]).toBe(v);
    for (const [k, v] of Object.entries(RewardEvents)) expect(RewardAdPluginEvents[k]).toBe(v);
  });

  it('uses the plugin consent enums', () => {
    for (const [k, v] of Object.entries(ConsentStatus)) expect(AdmobConsentStatus[k]).toBe(v);
    for (const [k, v] of Object.entries(PrivacyOptionsRequirementStatus)) expect(PluginPrivacy[k]).toBe(v);
  });
});
