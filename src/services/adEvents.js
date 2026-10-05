/**
 * Event names / enum values of @capacitor-community/admob, mirrored here so
 * AdService stays importable in Node tests without the Capacitor bridge.
 * tests/adEvents.test.js checks they match the plugin's own enums.
 */
export const BannerEvents = Object.freeze({
  SizeChanged: 'bannerAdSizeChanged',
  Loaded: 'bannerAdLoaded',
  FailedToLoad: 'bannerAdFailedToLoad',
});

export const InterstitialEvents = Object.freeze({
  Loaded: 'interstitialAdLoaded',
  FailedToLoad: 'interstitialAdFailedToLoad',
  Showed: 'interstitialAdShowed',
  FailedToShow: 'interstitialAdFailedToShow',
  Dismissed: 'interstitialAdDismissed',
});

export const RewardEvents = Object.freeze({
  Loaded: 'onRewardedVideoAdLoaded',
  FailedToLoad: 'onRewardedVideoAdFailedToLoad',
  Showed: 'onRewardedVideoAdShowed',
  FailedToShow: 'onRewardedVideoAdFailedToShow',
  Dismissed: 'onRewardedVideoAdDismissed',
  Rewarded: 'onRewardedVideoAdReward',
});

export const ConsentStatus = Object.freeze({
  REQUIRED: 'REQUIRED',
  NOT_REQUIRED: 'NOT_REQUIRED',
  OBTAINED: 'OBTAINED',
  UNKNOWN: 'UNKNOWN',
});

export const PrivacyOptionsRequirementStatus = Object.freeze({
  REQUIRED: 'REQUIRED',
  NOT_REQUIRED: 'NOT_REQUIRED',
  UNKNOWN: 'UNKNOWN',
});
