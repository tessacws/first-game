// Persistent save data (progress, coins, power-ups) in localStorage.
const KEY = 'pairpop3d.save.v1';

const DEFAULT_SAVE = {
  level: 1,
  coins: 0,
  completedCount: 0,
  stars: {}, // level number -> best stars
  powerups: { hint: 3, shuffle: 2, freeze: 2 },
  lastDailyGift: '', // YYYY-MM-DD of the last claimed daily gift
  adCoinsDay: '', // day the adCoinsCount below belongs to
  adCoinsCount: 0, // "watch ad for coins" uses today
};

/** Local calendar day as YYYY-MM-DD. */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULT_SAVE);
    const parsed = JSON.parse(raw);
    return {
      ...clone(DEFAULT_SAVE),
      ...parsed,
      powerups: { ...DEFAULT_SAVE.powerups, ...(parsed.powerups ?? {}) },
      stars: { ...(parsed.stars ?? {}) },
    };
  } catch {
    return clone(DEFAULT_SAVE);
  }
}

export const save = load();

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage may be unavailable (private mode); progress just won't persist.
  }
}

export function addCoins(n) {
  save.coins = Math.max(0, save.coins + n);
  persist();
}

export function usePowerup(name) {
  if ((save.powerups[name] ?? 0) <= 0) return false;
  save.powerups[name]--;
  persist();
  return true;
}

export function addPowerup(name, n = 1) {
  save.powerups[name] = (save.powerups[name] ?? 0) + n;
  persist();
}

export function completeLevel(levelNumber, stars, coins) {
  save.stars[levelNumber] = Math.max(save.stars[levelNumber] ?? 0, stars);
  if (levelNumber >= save.level) save.level = levelNumber + 1;
  save.completedCount++;
  save.coins += coins;
  persist();
}

export function dailyGiftAvailable() {
  return save.lastDailyGift !== today();
}

export function claimDailyGift(coins) {
  if (!dailyGiftAvailable()) return false;
  save.lastDailyGift = today();
  save.coins += coins;
  persist();
  return true;
}

/** How many "watch ad for coins" rewards are left today. */
export function adCoinsLeft(maxPerDay) {
  return save.adCoinsDay === today() ? Math.max(0, maxPerDay - save.adCoinsCount) : maxPerDay;
}

export function recordAdCoins(coins) {
  if (save.adCoinsDay !== today()) {
    save.adCoinsDay = today();
    save.adCoinsCount = 0;
  }
  save.adCoinsCount++;
  save.coins += coins;
  persist();
}

export function resetSave() {
  Object.assign(save, clone(DEFAULT_SAVE));
  persist();
}
