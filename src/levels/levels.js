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

/**
 * Returns the resolved config for a 1-based level number.
 * Levels past the end of the JSON keep the last level's pair count and
 * shave `endless.timeStep` seconds per level (down to `endless.minTime`).
 */
export function getLevel(n) {
  const idx = Math.max(1, Math.floor(n)) - 1;
  let base;
  if (idx < levels.length) {
    base = { ...levels[idx] };
  } else {
    const last = levels[levels.length - 1];
    const extra = idx - (levels.length - 1);
    base = {
      ...last,
      pairs: last.pairs + extra * (endless.pairsStep ?? 0),
      time: Math.max(endless.minTime ?? 30, last.time + extra * (endless.timeStep ?? 0)),
    };
  }

  const pool = base.types ?? allTypeIds();
  pool.forEach(getObjectType); // throws early on typos in levels.json
  const pairs = Math.min(base.pairs, pool.length);
  if (pairs < base.pairs) {
    console.warn(`Level ${n}: only ${pool.length} object types available, using ${pairs} pairs`);
  }

  return {
    number: idx + 1,
    pairs,
    time: base.time,
    types: shuffle(pool).slice(0, pairs),
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
