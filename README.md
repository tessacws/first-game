# Pair Pop 3D

A mobile-first 3D pair-matching puzzle. A pile of objects tumbles into a bowl
with real physics; tap objects to move them into the 2-slot match box. Two of a
kind pop, a mismatch gets thrown back into the pile. Clear the bowl before the
timer runs out.

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
`game` and `ui` objects are exposed on `window` for debugging.

### GitHub Pages

`vite.config.js` sets the base path to `/first-game/` for builds. If you rename
the repository, change `REPO_BASE` there (or set `BASE_PATH=/` when building
for a custom domain, or `BASE_PATH=./` for a Capacitor build).

`.github/workflows/deploy.yml` builds and deploys on every push to `main`.
Enable it once in **Settings → Pages → Source: GitHub Actions**.

## Project layout

```
src/
  main.js            boot: init Rapier, create Game + UI
  ads.js             ad stubs (showBanner, showInterstitial, showRewardedAd)
  style.css          all UI styling
  game/
    Game.js          renderer, camera fit, physics, pile, match box, power-ups
    arena.js         bowl mesh + static colliders
    particles.js     pooled pop particles
    tween.js         tiny tween helper
    storage.js       localStorage save (level, coins, stars, power-ups)
  levels/
    levels.json      level definitions
    levels.js        level resolution, stars and coin rewards
  objects/
    objects.js       object type registry (procedural or .glb)
    shapes.js        procedural placeholder geometries
  ui/
    UI.js            menu / HUD / pause / win / lose screens and flow
public/models/       drop .glb files here
```

## Adding / replacing objects

All object types live in `OBJECT_TYPES` in `src/objects/objects.js`:

```js
{ id: 'cube', name: 'Cube', color: '#ff4d4d', shape: 'cube', size: 0.9 },
```

| field   | meaning                                                                  |
| ------- | ------------------------------------------------------------------------ |
| `id`    | unique id, used by `levels.json`                                         |
| `name`  | display name                                                             |
| `color` | placeholder color (procedural shapes only)                               |
| `shape` | key of a builder in `src/objects/shapes.js`                              |
| `model` | optional path to a `.glb` file relative to `public/` — overrides `shape` |
| `size`  | optional size multiplier (default `1`)                                   |

**Swap a placeholder for a real model:** put the file in `public/models/` and
add a `model` field:

```js
{ id: 'cube', name: 'Cube', color: '#ff4d4d', shape: 'cube', model: 'models/cube.glb' },
```

The model is loaded with `GLTFLoader` (lazy-loaded only when a type uses it),
centered, scaled to the same size as every other object, and gets a convex-hull
physics collider built from its vertices. No game logic needs to change. Keep
models low-poly (a few hundred triangles) to hold 60 fps on phones.

**Add a new procedural type:** add a builder to `shapes` in `shapes.js` that
returns a `THREE.BufferGeometry`, then add an entry to `OBJECT_TYPES` that
references it. Levels that don't list explicit `types` pick from all
registered types automatically.

## Adding levels

Levels are in `src/levels/levels.json`. Each entry is one level, in order:

```json
{ "pairs": 10, "time": 110, "types": ["cube", "sphere", "star"] }
```

| field            | meaning                                                                        |
| ---------------- | ------------------------------------------------------------------------------ |
| `pairs`          | number of pairs (each type appears exactly twice)                              |
| `time`           | seconds on the clock                                                           |
| `types`          | optional pool of type ids; `pairs` of them are picked at random. Omit to use all types |
| `starThresholds` | optional `[twoStar, threeStar]` fraction of time left (default `[0.25, 0.5]`)  |
| `coinsPerLevel`  | optional base coin reward                                                      |
| `coinsPerStar`   | optional coins per star earned                                                 |

`pairs` can't exceed the number of available types (the game warns and caps it).
Past the last level the game keeps going endlessly using the `endless` block:
same pair count, `timeStep` seconds less per level, never below `minTime`.

## Power-ups

| power-up | effect                                                        |
| -------- | ------------------------------------------------------------- |
| Hint     | pulses one matching pair (the partner of a held object first) |
| Shuffle  | re-drops every object in the pile                             |
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

With `MOCK_ADS = true` (the default) these show **on-screen test ads**: a grey
banner, a 3-second interstitial, and a 5-second rewarded ad that grants nothing
if closed early. That lets you test the whole flow in the browser.

To go live, wrap the game with Capacitor, install an AdMob plugin (e.g.
`@capacitor-community/admob`), and replace the function bodies with the
plugin's calls. Nothing else in the game needs to change.

## Performance notes

- Pixel ratio capped at 2; MSAA only on low-DPR screens
- One shadow-casting light with a 1024 map; only the bowl receives shadows
- Low-poly geometries, shared per type; convex hulls capped at 256 points
- Fixed 60 Hz physics step with a capped catch-up
