// Ad layer. Every function returns a Promise; the rest of the game only uses
// these five functions and never talks to an ad SDK directly.
//
// - In the native app (Capacitor on Android/iOS) they use AdMob through
//   @capacitor-community/admob. Ad unit ids live in adConfig.js.
// - In a browser there is no AdMob, so MOCK_ADS shows on-screen placeholder
//   ads (banner, interstitial, rewarded) to test the whole flow.
import { Capacitor } from '@capacitor/core';
import { AD_UNITS, USE_TEST_ADS } from './adConfig.js';

const NATIVE = Capacitor.isNativePlatform();

export const MOCK_ADS = !NATIVE; // in the browser, show placeholder ads

/** Interstitial cadence: show one after every Nth completed level. */
export const INTERSTITIAL_EVERY = 2;

const INTERSTITIAL_SECONDS = 3;
const REWARDED_SECONDS = 5;

const log = (...a) => console.info('[ads]', ...a);
let bannerEl = null;

export async function showBanner() {
  log('showBanner');
  if (NATIVE) return native.showBanner();
  if (!MOCK_ADS) return;
  if (!bannerEl) {
    bannerEl = document.createElement('div');
    bannerEl.className = 'mock-banner';
    bannerEl.innerHTML = '<span class="ad-tag">AD</span> Test banner · 320×50';
    document.body.appendChild(bannerEl);
  }
  bannerEl.hidden = false;
}

export async function hideBanner() {
  log('hideBanner');
  if (NATIVE) return native.hideBanner();
  if (bannerEl) bannerEl.hidden = true;
}

export async function showInterstitial() {
  log('showInterstitial');
  if (NATIVE) return native.showInterstitial();
  if (!MOCK_ADS) return;
  await mockFullscreenAd({ title: 'Test interstitial ad', seconds: INTERSTITIAL_SECONDS, rewarded: false });
}

/** Resolves true when the user watched the full ad and earned the reward. */
export async function showRewardedAd() {
  log('showRewardedAd');
  if (NATIVE) return native.showRewarded();
  if (!MOCK_ADS) return true;
  const granted = await mockFullscreenAd({
    title: 'Test rewarded ad',
    seconds: REWARDED_SECONDS,
    rewarded: true,
  });
  log(granted ? 'reward granted' : 'closed early, no reward');
  return granted;
}

/** Call once at startup: consent (GDPR) and tracking prompts, then preload ads. */
export async function initAds() {
  if (NATIVE) await native.init();
}

// ---------------------------------------------------------------- AdMob (native)

const native = {
  admob: null,
  ready: false,
  units: null,

  async init() {
    try {
      const mod = await import('@capacitor-community/admob');
      this.mod = mod;
      this.admob = mod.AdMob;
      this.units = AD_UNITS[Capacitor.getPlatform()] ?? AD_UNITS.android;
      await this.admob.initialize({ initializeForTesting: USE_TEST_ADS });

      // iOS 14+: App Tracking Transparency prompt (text is in Info.plist)
      if (Capacitor.getPlatform() === 'ios') {
        const { status } = await this.admob.trackingAuthorizationStatus();
        if (status === 'notDetermined') await this.admob.requestTrackingAuthorization();
      }
      // EU/UK users: Google UMP consent form when required
      const info = await this.admob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === mod.AdmobConsentStatus.REQUIRED) {
        await this.admob.showConsentForm();
      }
      this.ready = true;
      this.preloadInterstitial();
      this.preloadRewarded();
    } catch (err) {
      console.warn('[ads] AdMob init failed, ads disabled', err);
    }
  },

  opts(adId) {
    return { adId, isTesting: USE_TEST_ADS };
  },

  async showBanner() {
    if (!this.ready) return;
    const { BannerAdSize, BannerAdPosition } = this.mod;
    await this.admob
      .showBanner({
        ...this.opts(this.units.banner),
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: 0,
      })
      .catch((e) => console.warn('[ads] banner', e));
  },

  async hideBanner() {
    if (!this.ready) return;
    await this.admob.hideBanner().catch(() => {});
  },

  interstitialLoaded: null,
  preloadInterstitial() {
    this.interstitialLoaded = this.admob
      .prepareInterstitial(this.opts(this.units.interstitial))
      .then(() => true)
      .catch(() => false);
  },

  async showInterstitial() {
    if (!this.ready || !(await this.interstitialLoaded)) return;
    const { InterstitialAdPluginEvents: E } = this.mod;
    await new Promise((resolve) => {
      const handles = [];
      const done = () => {
        handles.forEach((h) => h.then((x) => x.remove()));
        resolve();
      };
      handles.push(this.admob.addListener(E.Dismissed, done));
      handles.push(this.admob.addListener(E.FailedToShow, done));
      this.admob.showInterstitial().catch(done);
    });
    this.preloadInterstitial();
  },

  rewardedLoaded: null,
  preloadRewarded() {
    this.rewardedLoaded = this.admob
      .prepareRewardVideoAd(this.opts(this.units.rewarded))
      .then(() => true)
      .catch(() => false);
  },

  async showRewarded() {
    if (!this.ready) return false;
    if (!(await this.rewardedLoaded)) {
      // Nothing cached (offline / no fill): try once more right now.
      this.preloadRewarded();
      if (!(await this.rewardedLoaded)) return false;
    }
    const { RewardAdPluginEvents: E } = this.mod;
    const granted = await new Promise((resolve) => {
      let rewarded = false;
      const handles = [];
      const done = () => {
        handles.forEach((h) => h.then((x) => x.remove()));
        resolve(rewarded);
      };
      handles.push(this.admob.addListener(E.Rewarded, () => (rewarded = true)));
      handles.push(this.admob.addListener(E.Dismissed, done));
      handles.push(this.admob.addListener(E.FailedToShow, done));
      this.admob.showRewardVideoAd().catch(done);
    });
    this.preloadRewarded();
    return granted;
  },
};

// ---------------------------------------------------------------- mock ads (browser)

function mockFullscreenAd({ title, seconds, rewarded }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'mock-ad';
    el.innerHTML = `
      <div class="mock-ad-top">
        <span class="ad-tag">AD</span>
        <button class="mock-ad-close" aria-label="Close ad">✕</button>
      </div>
      <div class="mock-ad-body">
        <div class="mock-ad-title">${title}</div>
        <div class="mock-ad-sub">Real ads will appear here once AdMob is connected.</div>
        <div class="mock-ad-count"></div>
      </div>`;
    document.body.appendChild(el);
    const closeBtn = el.querySelector('.mock-ad-close');
    const count = el.querySelector('.mock-ad-count');
    let left = seconds;

    const finish = (granted) => {
      clearInterval(timer);
      el.remove();
      resolve(granted);
    };
    const render = () => {
      if (left > 0) {
        count.textContent = rewarded ? `Reward in ${left}s` : `You can close in ${left}s`;
      } else {
        count.textContent = rewarded ? 'Reward earned! Close the ad to collect.' : '';
        closeBtn.classList.add('ready');
      }
    };
    // Rewarded ads can be closed early (forfeiting the reward); interstitials can't.
    closeBtn.hidden = !rewarded;
    closeBtn.addEventListener('click', () => finish(left <= 0));
    const timer = setInterval(() => {
      left--;
      if (left <= 0) {
        clearInterval(timer);
        closeBtn.hidden = false;
      }
      render();
    }, 1000);
    render();
  });
}
