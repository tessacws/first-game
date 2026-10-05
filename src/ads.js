// Ad stubs. Replace the bodies with AdMob calls via Capacitor
// (e.g. @capacitor-community/admob) when wrapping the game as a native app.
// Every function returns a Promise so callers don't change when real ads land.

const log = (...a) => console.info('[ads]', ...a);

export async function showBanner() {
  log('showBanner (stub)');
}

export async function hideBanner() {
  log('hideBanner (stub)');
}

export async function showInterstitial() {
  log('showInterstitial (stub)');
}

/** Resolves true when the user watched the full ad and earned the reward. */
export async function showRewardedAd() {
  log('showRewardedAd (stub) -> reward granted');
  return true;
}

/** Interstitial cadence: show one after every Nth completed level. */
export const INTERSTITIAL_EVERY = 2;
