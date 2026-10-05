// Ad layer. Every function returns a Promise so callers don't change when
// real ads land: replace the bodies with AdMob calls via Capacitor
// (e.g. @capacitor-community/admob) when wrapping the game as a native app.
//
// Until then, MOCK_ADS shows on-screen placeholder ads so the whole flow
// (banner, interstitial, rewarded) can be seen and tested in the browser.
// Set it to false to make the stubs silent (rewarded ads then always grant).

export const MOCK_ADS = true;

/** Interstitial cadence: show one after every Nth completed level. */
export const INTERSTITIAL_EVERY = 2;

const INTERSTITIAL_SECONDS = 3;
const REWARDED_SECONDS = 5;

const log = (...a) => console.info('[ads]', ...a);
let bannerEl = null;

export async function showBanner() {
  log('showBanner');
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
  if (bannerEl) bannerEl.hidden = true;
}

export async function showInterstitial() {
  log('showInterstitial');
  if (!MOCK_ADS) return;
  await mockFullscreenAd({ title: 'Test interstitial ad', seconds: INTERSTITIAL_SECONDS, rewarded: false });
}

/** Resolves true when the user watched the full ad and earned the reward. */
export async function showRewardedAd() {
  log('showRewardedAd');
  if (!MOCK_ADS) return true;
  const granted = await mockFullscreenAd({
    title: 'Test rewarded ad',
    seconds: REWARDED_SECONDS,
    rewarded: true,
  });
  log(granted ? 'reward granted' : 'closed early, no reward');
  return granted;
}

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
