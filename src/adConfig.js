// AdMob ad unit ids. These are Google's official TEST ids: they always serve
// test ads and are safe to use while developing.
//
// Before publishing:
//   1. Create an app per platform at https://admob.google.com and an ad unit
//      for each format (banner, interstitial, rewarded).
//   2. Paste the ad unit ids below and set USE_TEST_ADS to false.
//   3. Put the AdMob *app* ids (with "~") in
//        android/app/src/main/res/values/strings.xml  (admob_app_id)
//        ios/App/App/Info.plist                        (GADApplicationIdentifier)
//
// Never tap your own live ads: AdMob can suspend the account for it. Keep
// USE_TEST_ADS = true (or register your phone as a test device) while testing.

export const USE_TEST_ADS = true;

export const AD_UNITS = {
  android: {
    banner: 'ca-app-pub-3940256099942544/6300978111',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
  },
  ios: {
    banner: 'ca-app-pub-3940256099942544/2934735716',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
  },
};
