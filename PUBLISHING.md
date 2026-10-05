# Publishing Pair Pop 3D to Google Play and the App Store

The game is a web app wrapped as a native app with [Capacitor](https://capacitorjs.com).
The `android/` and `ios/` folders are real native projects; you open them in
Android Studio / Xcode, build, and upload.

Already set up in this repo:

- Capacitor config (`capacitor.config.json`), app id `com.pairpop.game`
- Portrait-only, full screen, status bar hidden
- AdMob wired in `src/ads.js` (banner on menu, interstitial every 2 levels,
  rewarded ads), using **Google test ad ids** until you add yours
- GDPR consent form (EU/UK) and the iOS tracking prompt
- App icons and splash screens for both platforms (`assets/` sources)
- Privacy policy page: `public/privacy.html`
  → `https://tessacws.github.io/first-game/privacy.html` once GitHub Pages is on

---

## 0. Before anything: decide these (they're permanent)

1. **App id / bundle id.** Currently `com.pairpop.game`. It can never change
   after the first upload, so pick your own now, e.g. `com.yourstudio.pairpop`.
   Change it in **all** of these, then run `npm run build:app`:
   - `capacitor.config.json` → `appId`
   - `android/app/build.gradle` → `namespace` and `applicationId`
   - `android/app/src/main/res/values/strings.xml` → `package_name`, `custom_url_scheme`
   - `android/app/src/main/java/com/pairpop/game/MainActivity.java` → move the file to
     the new package folder and update its `package` line
   - Xcode → App target → *Signing & Capabilities* → Bundle Identifier
2. **App name.** "Pair Pop 3D" in `capacitor.config.json`, `strings.xml`
   (`app_name`, `title_activity_main`) and `Info.plist` (`CFBundleDisplayName`).
   Search both stores first to make sure the name isn't taken.
3. **Fill in the privacy policy** placeholders in `public/privacy.html`
   (`[DATE]`, `[YOUR NAME OR COMPANY]`, `[YOUR SUPPORT EMAIL]`), push, and
   enable GitHub Pages (repo *Settings → Pages → Source: GitHub Actions*).

## 1. Accounts you need

| Account | Cost | Link |
| --- | --- | --- |
| Google Play Console | US$25 once | https://play.google.com/console/signup |
| Apple Developer Program | US$99 / year | https://developer.apple.com/programs/enroll/ |
| Google AdMob | free | https://admob.google.com |

Apple and Google both verify your identity (ID document; organisations also
need a D-U-N-S number). That can take a few days, so start early.

## 2. Tools on your Mac

- **Node.js 20+** (you already have it)
- **Android Studio** (latest): https://developer.android.com/studio. On first
  launch let it install the Android SDK.
- **Xcode** (latest, from the Mac App Store). Open it once and accept the license.
  The iOS app can only be built on a Mac.

## 3. Build and run on your phone

```bash
cd first-game
git pull origin main
npm install
npm run android   # builds the web app, syncs it, opens Android Studio
npm run ios       # same, opens Xcode
```

- **Android Studio:** wait for Gradle sync to finish, plug in your phone (enable
  *Developer options → USB debugging*), press ▶ Run.
- **Xcode:** select the *App* target → *Signing & Capabilities* → tick
  *Automatically manage signing* and choose your Team. Plug in your iPhone,
  pick it at the top, press ▶ Run.

Every time you change the game code, run `npm run build:app` (or
`npm run android` / `npm run ios`) so the native apps get the new version.

You should see **Google test ads** (labelled "Test Ad"). That means AdMob works.

## 4. AdMob: real ads

1. In AdMob, **Apps → Add app**, once for Android and once for iOS (choose
   "not listed yet"; you can link the store listing later).
2. For each app, create 3 ad units: **Banner**, **Interstitial**, **Rewarded**.
3. Put the ids in the code:
   - Ad unit ids (`ca-app-pub-…/…`) → `src/adConfig.js`, then set `USE_TEST_ADS = false`
   - Android **app id** (`ca-app-pub-…~…`) → `android/app/src/main/res/values/strings.xml` (`admob_app_id`)
   - iOS **app id** → `ios/App/App/Info.plist` (`GADApplicationIdentifier`)
4. In AdMob → **Privacy & messaging**, create a **GDPR message** (for EU/UK)
   and an **IDFA explainer** message (iOS). The game already shows them.
5. **app-ads.txt:** AdMob asks you to host `app-ads.txt` at the root of the
   website you list in the store, e.g. `https://yourdomain.com/app-ads.txt`.
   It can't live under `/first-game/`, so use your own domain, or create a repo
   named `tessacws.github.io` with Pages on and put the file at its root.
6. **Never tap your own real ads.** Test with `USE_TEST_ADS = true`, or add
   your phone as a test device in AdMob (*Settings → Test devices*).

New AdMob apps often show few or no ads for the first days. That's normal.

## 5. Google Play

### Build the release file (.aab)
1. Bump the version for every upload: `android/app/build.gradle` → `versionCode`
   (1, 2, 3 …) and `versionName` ("1.0.1" …).
2. `npm run build:app`, then in Android Studio:
   **Build → Generate Signed App Bundle / APK → Android App Bundle**.
3. Create a new **upload key** (keystore) when asked. **Back up the keystore
   file and its passwords.** You need them for every future update.
4. The file lands in `android/app/release/app-release.aab`.

### Play Console
1. **Create app** → name, default language, *Game*, *Free*.
2. Complete **App content** (left menu → *Policy and programs → App content*):
   - Privacy policy URL (`…/privacy.html`)
   - Ads: **Yes, my app contains ads**
   - App access: all functionality available without login
   - Content rating questionnaire (puzzle, no violence → typically *Everyone / PEGI 3*)
   - Target audience: choose **13+** age groups. Picking under-13 puts the app
     under the stricter *Families* policy and limits ads.
   - Data safety: declare that the app **collects device or other IDs** and
     **approximate location** (by the AdMob SDK) for **advertising**, data is
     encrypted in transit, no account. Google's AdMob guide:
     https://developers.google.com/admob/android/privacy/play-data-disclosure
   - Government apps / financial features / health: No
3. **Store listing:** short description (80 chars), full description, app icon
   512×512 (`public/icons/icon-512.webp` exported as PNG, or `assets/icon-only.png`
   resized), feature graphic 1024×500, at least 2 phone screenshots
   (portrait, e.g. 1080×1920).
4. **Testing → Closed testing:** upload the `.aab`. **New personal developer
   accounts must run a closed test with at least 12 testers for 14 days**
   before they can publish to production. Invite friends by email, have them
   opt in and play.
5. After the 14 days: **Production → Create release**, upload, **Send for review**.
   Reviews usually take a few days.

## 6. Apple App Store

### App Store Connect
1. https://appstoreconnect.apple.com → **Apps → + → New App**: iOS, name,
   language, the bundle id from step 0, SKU (any text, e.g. `pairpop3d`).
2. **App Privacy:** *Data used to track you* → **Device ID** (advertising), and
   *Data linked / not linked* → **Coarse location**, **Product interaction**,
   **Advertising data** for *Third-party advertising*. Add the privacy policy URL.
3. **Age rating** questionnaire (all "None" → 4+). Mark the app as containing ads.
4. **Screenshots:** 6.9" iPhone (1320×2868) is required. The app is
   iPhone-only, so no iPad screenshots are needed.
5. Description, keywords, support URL (can be the GitHub repo or a simple page).

### Upload
1. In Xcode: bump **Version** (1.0.1 …) and **Build** (1, 2, 3 …) on the App target.
2. Select **Any iOS Device (arm64)** at the top → **Product → Archive**.
3. In the Organizer window: **Distribute App → App Store Connect → Upload**.
4. After processing (~15 min) the build appears in **TestFlight**. Install it
   on your iPhone via the TestFlight app and check ads + gameplay.
5. In App Store Connect, add the build to the version → **Add for Review → Submit**.
   Reviews usually take 1–3 days.

Common Apple rejection to avoid: the tracking prompt must appear **before** any
tracking. The game already asks on startup, before ads load.

## 7. Updating later

```bash
# change code → test in the browser with npm run dev
npm run build:app
# bump versionCode/versionName (Android) and Version/Build (Xcode)
# Android Studio: Generate Signed Bundle → upload to Play Console
# Xcode: Product → Archive → Distribute → submit in App Store Connect
```

## Checklist

- [ ] Own app id / bundle id set everywhere
- [ ] Privacy policy filled in and live on GitHub Pages
- [ ] Real AdMob app ids + ad unit ids, `USE_TEST_ADS = false`
- [ ] GDPR + IDFA messages created in AdMob
- [ ] app-ads.txt hosted on your website
- [ ] Android keystore backed up
- [ ] Play: closed test, 12 testers × 14 days
- [ ] Screenshots, descriptions, content rating, data safety / app privacy done
