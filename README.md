# Pair Pop 3D

A mobile-first 3D pair-matching puzzle. A pile of toys and snacks tumbles onto
a table with real physics; tap objects to move them onto the round 2-slot match
plate. Two of a kind pop, a mismatch gets thrown back into the pile. Clear the
table before the timer runs out.

Built with [Three.js](https://threejs.org), [Rapier](https://rapier.rs)
(`@dimforge/rapier3d-compat`), [Vite](https://vitejs.dev) and plain JavaScript.

## Running

```bash
npm install
npm run dev       # dev server on http://localhost:5173 (also exposed on your LAN for phone testing)
npm run build     # production build into dist/
npm run preview   # serve the production build at http://localhost:4173/first-game/
```

Works with touch on phones and with the mouse on desktop. In dev mode the
`game` and `ui` objects are exposed on `window` for debugging, and
`http://localhost:5173/gallery.html` shows every object model in a grid.

### GitHub Pages

`vite.config.js` sets the base path to `/first-game/` for builds. If you rename
the repository, change `REPO_BASE` there (or set `BASE_PATH=/` when building
for a custom domain, or `BASE_PATH=./` for a Capacitor build).

`.github/workflows/deploy.yml` builds and deploys on every push to `main`.
Enable it once in **Settings → Pages → Source: GitHub Actions**.

## Mobile apps (Google Play / App Store)

The game ships as native Android and iOS apps through Capacitor
(`android/`, `ios/`, `capacitor.config.json`). Real AdMob ads run in the app;
the browser keeps the on-screen test ads.

```bash
npm run build:app   # build the web app for the native shell and sync it
npm run android     # build:app + open Android Studio
npm run ios         # build:app + open Xcode (Mac only)
```

Step-by-step store submission (accounts, AdMob ids, signing, store listings,
privacy forms): **[PUBLISHING.md](PUBLISHING.md)**.

## Project layout

```
src/
  main.js            boot: ads consent, init Rapier, create Game + UI
  ads.js             ads: AdMob in the app, on-screen test ads in the browser
  adConfig.js        AdMob ad unit ids (Google test ids by default)
  style.css          all UI styling
  game/
    Game.js          renderer, camera fit, physics, pile, match plate, power-ups
    arena.js         table, invisible walls, 3D match plate
    particles.js     pooled pop particles
    tween.js         tiny tween helper
    storage.js       localStorage save (level, coins, stars, power-ups)
  levels/
    levels.json      level definitions
    levels.js        level resolution, stars and coin rewards
  objects/
    objects.js       object type registry (procedural or .glb)
    shapes.js        procedural toy models (volleyball, burger, donut, ...)
    build.js         helpers for building vertex-colored models from primitives
  gallery.js         dev page that renders every model (gallery.html)
  ui/
    UI.js            menu / HUD / pause / win / lose screens and flow
public/models/       drop .glb files here
public/privacy.html  privacy policy (required by the stores)
assets/              source images for app icons and splash screens
android/, ios/       native app projects (Capacitor)
```

## Adding / replacing objects

All object types live in `OBJECT_TYPES` in `src/objects/objects.js`:

```js
{ id: 'burger', name: 'Burger', color: '#f0a94f', shape: 'burger' },
```

| field   | meaning                                                                  |
| ------- | ------------------------------------------------------------------------ |
| `id`    | unique id, used by `levels.json`                                         |
| `name`  | display name                                                             |
| `color` | accent color, used for the pop particles                                 |
| `shape` | key of a builder in `src/objects/shapes.js`                              |
| `model` | optional path to a `.glb` file relative to `public/` — overrides `shape` |
| `size`  | optional size multiplier (default `1`)                                   |

**Swap a placeholder for a real model:** put the file in `public/models/` and
add a `model` field:

```js
{ id: 'burger', name: 'Burger', color: '#f0a94f', shape: 'burger', model: 'models/burger.glb' },
```

The model is loaded with `GLTFLoader` (lazy-loaded only when a type uses it),
centered, scaled to the same size as every other object, and gets a convex-hull
physics collider built from its vertices. No game logic needs to change. Keep
models low-poly (a few hundred triangles) to hold 60 fps on phones.

Good free (CC0) sources: the Kenney *Food Kit* and *Toy Kit*, and Quaternius
packs. Export as `.glb`.

**Add a new procedural type:** add a builder to `shapes` in `shapes.js` that
returns a `THREE.BufferGeometry` (use `part()` and `merge()` from `build.js` to
combine colored primitives into one mesh), then add an entry to
`OBJECT_TYPES` that references it. Check it in `gallery.html`. Levels that
don't list explicit `types` pick from all registered types automatically.

## Adding levels

Levels are in `src/levels/levels.json`. Each entry is one level, in order:

```json
{ "pairs": 24, "pairsPerType": 3, "time": 165, "types": ["burger", "donut", "apple"] }
```

| field            | meaning                                                                        |
| ---------------- | ------------------------------------------------------------------------------ |
| `pairs`          | total number of pairs (objects on the table = `pairs × 2`)                     |
| `pairsPerType`   | how many pairs share one type. `24` pairs with `3` per type = 8 types, 6 objects each |
| `time`           | seconds on the clock                                                           |
| `types`          | optional pool of type ids to pick from. Omit to use all types                  |
| `starThresholds` | optional `[twoStar, threeStar]` fraction of time left (default `[0.25, 0.5]`)  |
| `coinsPerLevel`  | optional base coin reward                                                      |
| `coinsPerStar`   | optional coins per star earned                                                 |

The table grows with the number of objects, so a 16-object level and a
100-object level both fill the screen. Past the last level the game keeps going
using the `endless` block: `pairsStep` more pairs per level up to `maxPairs`,
with the seconds per pair shrinking by `secondsPerPairStep` down to
`minSecondsPerPair`.

## Power-ups

| power-up | effect                                                        |
| -------- | ------------------------------------------------------------- |
| Hint     | pulses one matching pair (the partner of a held object first) |
| Shuffle  | re-drops every object in the pile                             |
| Magnet   | pulls a matching pair onto the plate                          |
| Freeze   | stops the timer for 10 seconds                                |

Counts are saved in `localStorage`. Tapping a power-up you have none of pauses
the game and offers **Buy 1 for 50 coins** or **Watch ad for 1 free**.

## Coins

| source                     | amount                                  |
| -------------------------- | --------------------------------------- |
| Clearing a level           | 20 + 10 per star (`levels.json`)        |
| Win screen "double coins"  | rewarded ad doubles that level's coins  |
| Daily gift (menu / shop)   | 50, once per calendar day               |
| "Watch ad" (menu / shop)   | 25 per ad, up to 5 per day              |
| 3-star clear               | bonus: one random free power-up         |

Coins are spent in the **Shop** (menu, or pause menu in game) at 50 per
power-up. All numbers are constants at the top of `src/ui/UI.js`.

## Ads

`src/ads.js` is the single place ads live:

- `showBanner()` / `hideBanner()`: banner on the menu, hidden in game
- `showInterstitial()`: before the next level after every 2nd completed level (`INTERSTITIAL_EVERY`)
- `showRewardedAd()`: resolves `true` only if the ad was watched to the end. Used for +30s on the
  lose screen, double coins, free coins and free power-ups

In the **native app** they use Google AdMob (`@capacitor-community/admob`):
adaptive banner, interstitial and rewarded ads, plus the GDPR consent form and
the iOS tracking prompt at startup. Ad unit ids are in `src/adConfig.js` and
default to Google's test ids. See [PUBLISHING.md](PUBLISHING.md) for going live.

In the **browser** they show **on-screen test ads**: a grey banner, a 3-second
interstitial, and a 5-second rewarded ad that grants nothing if closed early,
so the whole flow can be tested with `npm run dev`.

## Performance notes

- Pixel ratio capped at 2; MSAA only on low-DPR screens
- One shadow-casting light with a 1024 map; only the table receives shadows
- Each procedural model is a single vertex-colored mesh (one draw call),
  shared per type; convex hulls capped at 256 points
- 100 objects ≈ 40k triangles; physics ≈ 0.5 ms/frame once the pile settles
- Fixed 60 Hz physics step with a capped catch-up
