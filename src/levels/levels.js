// Level loading. Levels live in levels.json; see README for the format.
import data from './levels.json';
import { allTypeIds, getObjectType } from '../objects/objects.js';

const { defaults, levels, endless } = data;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Raw config for a level number, extrapolating past the end of levels.json. */
function rawLevel(idx) {
  if (idx < levels.length) return { ...levels[idx] };
  const last = levels[levels.length - 1];
  const extra = idx - (levels.length - 1);
  const pairs = Math.min(endless.maxPairs ?? Infinity, last.pairs + extra * (endless.pairsStep ?? 0));
  // Seconds per pair keep shrinking (down to a floor), so it always gets tighter.
  const spp = Math.max(
    endless.minSecondsPerPair ?? 3,
    last.time / last.pairs + extra * (endless.secondsPerPairStep ?? -0.1),
  );
  const time = Math.ceil(pairs * spp);
  const { types, ...rest } = last; // endless levels draw from every type
  return { ...rest, pairs, time };
}

/**
 * Returns the resolved config for a 1-based level number:
 * { number, pairs, time, types (distinct ids), items (one id per object, 2 per pair), ... }
 *
 * `pairsPerType` decides how many pairs share a type: with 12 pairs and
 * pairsPerType 2 there are 6 types, 4 objects of each.
 */
export function getLevel(n) {
  const idx = Math.max(1, Math.floor(n)) - 1;
  const base = rawLevel(idx);
  const pool = base.types ?? allTypeIds();
  pool.forEach(getObjectType); // throws early on typos in levels.json

  const perType = Math.max(1, base.pairsPerType ?? defaults.pairsPerType ?? 1);
  let typeCount = Math.ceil(base.pairs / perType);
  if (typeCount > pool.length) {
    console.warn(`Level ${n}: needs ${typeCount} types but only ${pool.length} available; reusing types`);
    typeCount = pool.length;
  }
  const types = shuffle(pool).slice(0, typeCount);

  // Deal the pairs out round-robin so every type gets pairsPerType (±1) pairs.
  const items = [];
  for (let p = 0; p < base.pairs; p++) {
    const id = types[p % types.length];
    items.push(id, id);
  }

  return {
    number: idx + 1,
    pairs: base.pairs,
    time: base.time,
    types,
    items,
    starThresholds: base.starThresholds ?? defaults.starThresholds,
    coinsPerLevel: base.coinsPerLevel ?? defaults.coinsPerLevel,
    coinsPerStar: base.coinsPerStar ?? defaults.coinsPerStar,
  };
}

/** 1-3 stars from the fraction of time left. */
export function starsFor(level, timeLeft) {
  const frac = timeLeft / level.time;
  const [two, three] = level.starThresholds;
  if (frac >= three) return 3;
  if (frac >= two) return 2;
  return 1;
}

export function coinsFor(level, stars) {
  return level.coinsPerLevel + stars * level.coinsPerStar;
}
