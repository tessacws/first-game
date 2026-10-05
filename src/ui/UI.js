// DOM screens and HUD. Owns the flow between menu / game / win / lose / shop
// and drives the Game instance.
import { getLevel, starsFor, coinsFor } from '../levels/levels.js';
import {
  save,
  addCoins,
  addPowerup,
  usePowerup,
  completeLevel,
  dailyGiftAvailable,
  claimDailyGift,
  adCoinsLeft,
  recordAdCoins,
} from '../game/storage.js';
import * as ads from '../ads.js';

// Economy tuning
const POWERUP_PRICE = 50;
const REWARD_SECONDS = 30; // lose screen "watch ad for +30s"
const DAILY_GIFT_COINS = 50;
const AD_COINS = 25; // "watch ad for coins"
const AD_COINS_PER_DAY = 5;

const POWERUPS = [
  { id: 'hint', icon: '💡', label: 'Hint', desc: 'Highlights a matching pair' },
  { id: 'shuffle', icon: '🌀', label: 'Shuffle', desc: 'Re-drops the whole pile' },
  { id: 'magnet', icon: '🧲', label: 'Magnet', desc: 'Pulls a matching pair onto the plate' },
  { id: 'freeze', icon: '❄️', label: 'Freeze', desc: 'Stops the timer for 10s' },
];
const powerupById = Object.fromEntries(POWERUPS.map((p) => [p.id, p]));

const html = String.raw;

const boosterButton = (p) => html`<button class="powerup" data-powerup="${p.id}" aria-label="${p.label}">
  <span class="pu-icon">${p.icon}</span>
  <span class="pu-badge" data-bind="pu-${p.id}">0</span>
</button>`;
const COIN = '<span class="coin">●</span>';

function formatTime(t) {
  const s = Math.ceil(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class UI {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.level = null;
    this.rewardUsed = false;
    this.lastShownSecond = -1;
    this.lastWinCoins = 0;
    this.pendingPowerup = null; // power-up the out-of dialog is about
    this.shopReturn = null; // screen to return to when the shop closes
    root.innerHTML = this.#template();
    this.$ = (sel) => root.querySelector(sel);
    this.#bind();

    Object.assign(game.events, {
      onTime: (t) => this.#updateTimer(t),
      onWin: (r) => this.#onWin(r),
      onLose: () => this.#onLose(),
      onMismatch: () => this.#shakeBox(),
      onMatch: () => {},
      onFreezeChange: (on) => root.classList.toggle('frozen', on),
    });

    const relayout = () => this.layout();
    window.addEventListener('resize', relayout);
    window.visualViewport?.addEventListener('resize', relayout);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game.state === 'playing') this.#pause();
    });
    this.layout();
  }

  #template() {
    return html`
      <div id="hud" class="hidden">
        <div class="hud-top">
          <button class="icon-btn" data-action="pause" aria-label="Pause">❚❚</button>
          <div class="hud-level">Level <span data-bind="hud-level">1</span></div>
          <div class="hud-timer" data-bind="timer">2:00</div>
          <div class="coins-pill">${COIN}<span data-bind="coins">0</span></div>
        </div>
        <div class="hud-bottom">
          <div class="booster-col">${POWERUPS.slice(0, 2).map(boosterButton).join('')}</div>
          <div class="plate" aria-label="Match plate"></div>
          <div class="booster-col">${POWERUPS.slice(2).map(boosterButton).join('')}</div>
        </div>
      </div>

      <div id="menu" class="screen">
        <div class="panel">
          <h1 class="logo">Pair<br /><span>Pop 3D</span></h1>
          <div class="menu-stats">
            <div class="stat"><small>Level</small><b data-bind="menu-level">1</b></div>
            <div class="stat"><small>Coins</small><b>${COIN} <span data-bind="menu-coins">0</span></b></div>
          </div>
          <button class="btn btn-primary btn-big" data-action="play">Play</button>
          <div class="btn-row">
            <button class="btn btn-gift" data-action="daily" data-bind="daily-btn">🎁 Daily gift</button>
            <button class="btn" data-action="shop">🛒 Shop</button>
          </div>
          <button class="btn btn-ad" data-action="ad-coins" data-bind="menu-ad-coins"></button>
          <p class="hint-text">Tap objects to put them in the box.<br />Match pairs before time runs out!</p>
        </div>
      </div>

      <div id="shop" class="screen overlay hidden">
        <div class="panel">
          <h2>Shop</h2>
          <div class="shop-coins">${COIN} <span data-bind="shop-coins">0</span></div>
          <div class="shop-list">
            ${POWERUPS.map(
              (p) => html`<div class="shop-item">
                <span class="shop-icon">${p.icon}</span>
                <span class="shop-info"><b>${p.label}</b><small>${p.desc}</small></span>
                <span class="shop-owned">×<span data-bind="owned-${p.id}">0</span></span>
                <button class="btn btn-primary btn-small" data-action="buy" data-id="${p.id}">
                  ${POWERUP_PRICE} ${COIN}
                </button>
              </div>`,
            ).join('')}
          </div>
          <h3>Get coins</h3>
          <button class="btn btn-ad" data-action="ad-coins" data-bind="shop-ad-coins"></button>
          <button class="btn btn-gift" data-action="daily" data-bind="shop-daily-btn">🎁 Daily gift</button>
          <button class="btn btn-ghost" data-action="close-shop">Close</button>
        </div>
      </div>

      <div id="outof" class="screen overlay hidden">
        <div class="panel">
          <div class="big-icon" data-bind="outof-icon">💡</div>
          <h2>Out of <span data-bind="outof-name">Hints</span>!</h2>
          <p class="sub">You have ${COIN} <span data-bind="outof-coins">0</span></p>
          <button class="btn btn-primary" data-action="outof-buy">Buy 1 for ${POWERUP_PRICE} ${COIN}</button>
          <button class="btn btn-ad" data-action="outof-ad">▶ Watch ad for 1 free</button>
          <button class="btn btn-ghost" data-action="outof-cancel">Cancel</button>
        </div>
      </div>

      <div id="pause" class="screen overlay hidden">
        <div class="panel">
          <h2>Paused</h2>
          <button class="btn btn-primary" data-action="resume">Resume</button>
          <button class="btn" data-action="restart">Restart</button>
          <button class="btn" data-action="shop">🛒 Shop</button>
          <button class="btn btn-ghost" data-action="menu">Menu</button>
        </div>
      </div>

      <div id="win" class="screen overlay hidden">
        <div class="panel">
          <h2>Level Complete!</h2>
          <div class="stars" data-bind="stars">
            <span class="star">★</span><span class="star">★</span><span class="star">★</span>
          </div>
          <div class="reward">+<span data-bind="coins-earned">0</span> ${COIN}</div>
          <div class="bonus" data-bind="bonus"></div>
          <button class="btn btn-ad" data-action="double">▶ Watch ad to double coins</button>
          <button class="btn btn-primary btn-big" data-action="next">Next</button>
          <button class="btn btn-ghost" data-action="menu">Menu</button>
        </div>
      </div>

      <div id="lose" class="screen overlay hidden">
        <div class="panel">
          <h2>Time's up!</h2>
          <p class="sub">Need a few more seconds?</p>
          <button class="btn btn-ad" data-action="reward">▶ Watch ad for +${REWARD_SECONDS}s</button>
          <button class="btn btn-primary" data-action="retry">Retry</button>
          <button class="btn btn-ghost" data-action="menu">Menu</button>
        </div>
      </div>

      <div id="loading" class="screen hidden"><div class="spinner"></div></div>
      <div class="toast" data-bind="toast"></div>
    `;
  }

  #bind() {
    this.root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action], [data-powerup]');
      if (!btn || btn.disabled) return;
      if (btn.dataset.powerup) return this.#usePowerup(btn.dataset.powerup);
      switch (btn.dataset.action) {
        case 'play':
          return this.startLevel(save.level);
        case 'pause':
          return this.#pause();
        case 'resume':
          return this.#resume();
        case 'restart':
        case 'retry':
          return this.startLevel(this.level.number);
        case 'menu':
          return this.showMenu();
        case 'next':
          return this.#next();
        case 'reward':
          return this.#rewardTime(btn);
        case 'double':
          return this.#doubleCoins(btn);
        case 'daily':
          return this.#claimDaily();
        case 'ad-coins':
          return this.#adCoins(btn);
        case 'shop':
          return this.#openShop();
        case 'close-shop':
          return this.#closeShop();
        case 'buy':
          return this.#buy(btn.dataset.id);
        case 'outof-buy':
          return this.#outOfBuy();
        case 'outof-ad':
          return this.#outOfAd(btn);
        case 'outof-cancel':
          return this.#closeOutOf();
      }
    });
  }

  bind(name) {
    return this.root.querySelector(`[data-bind="${name}"]`);
  }

  show(id, on = true) {
    this.$(`#${id}`).classList.toggle('hidden', !on);
  }

  isShown(id) {
    return !this.$(`#${id}`).classList.contains('hidden');
  }

  /** Measures the HUD and tells the game where the free play area and slots are. */
  layout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const top = this.$('.hud-top').getBoundingClientRect().bottom;
    const bottomTop = this.$('.hud-bottom').getBoundingClientRect().top;
    const plateRect = this.$('.plate').getBoundingClientRect();
    this.game.layout(w, h, top, h - bottomTop, plateRect);
  }

  /** Re-renders every coin / power-up count and coin-earning button. */
  refreshCounts() {
    for (const name of ['coins', 'menu-coins', 'shop-coins', 'outof-coins']) {
      this.bind(name).textContent = save.coins;
    }
    this.bind('menu-level').textContent = save.level;
    for (const p of POWERUPS) {
      const n = save.powerups[p.id] ?? 0;
      const badge = this.bind(`pu-${p.id}`);
      badge.textContent = n > 0 ? n : '+';
      badge.classList.toggle('buy', n <= 0);
      this.bind(`owned-${p.id}`).textContent = n;
    }
    this.root.querySelectorAll('[data-action="buy"]').forEach((b) => {
      b.disabled = save.coins < POWERUP_PRICE;
    });

    const daily = dailyGiftAvailable();
    for (const name of ['daily-btn', 'shop-daily-btn']) {
      const b = this.bind(name);
      b.disabled = !daily;
      b.textContent = daily ? `🎁 Daily gift +${DAILY_GIFT_COINS}` : '🎁 Come back tomorrow';
    }
    const left = adCoinsLeft(AD_COINS_PER_DAY);
    for (const name of ['menu-ad-coins', 'shop-ad-coins']) {
      const b = this.bind(name);
      b.disabled = left <= 0;
      b.textContent = left > 0 ? `▶ Watch ad: +${AD_COINS} coins · ${left} left` : 'No more free coins today';
    }
  }

  toast(text) {
    const t = this.bind('toast');
    t.textContent = text;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  }

  #coinGain(amount) {
    this.refreshCounts();
    this.toast(`+${amount} coins!`);
    for (const el of this.root.querySelectorAll('.coins-pill, .menu-stats .stat:last-child, .shop-coins')) {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  }

  // ---------------------------------------------------------------- flow

  showMenu() {
    this.game.stop();
    this.root.classList.remove('frozen');
    ['hud', 'pause', 'win', 'lose', 'loading', 'shop', 'outof'].forEach((id) => this.show(id, false));
    this.show('menu');
    this.refreshCounts();
    ads.showBanner();
  }

  async startLevel(n) {
    ['menu', 'pause', 'win', 'lose', 'shop', 'outof'].forEach((id) => this.show(id, false));
    this.show('hud');
    this.show('loading');
    ads.hideBanner();
    this.level = getLevel(n);
    this.rewardUsed = false;
    this.bind('hud-level').textContent = this.level.number;
    this.refreshCounts();
    this.layout();
    try {
      await this.game.loadLevel(this.level);
    } finally {
      this.show('loading', false);
    }
  }

  #pause() {
    if (this.game.state !== 'playing') return;
    this.game.pause();
    this.show('pause');
  }

  #resume() {
    this.show('pause', false);
    this.game.resume();
  }

  #updateTimer(t) {
    const s = Math.ceil(t);
    if (s === this.lastShownSecond) return;
    this.lastShownSecond = s;
    const el = this.bind('timer');
    el.textContent = formatTime(t);
    el.classList.toggle('low', t <= 10);
  }

  #shakeBox() {
    const box = this.$('.plate');
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
    navigator.vibrate?.(60);
  }

  // ---------------------------------------------------------------- power-ups

  #usePowerup(id) {
    if (this.game.state !== 'playing') return;
    if ((save.powerups[id] ?? 0) <= 0) return this.#openOutOf(id);
    this.#activate(id);
  }

  #activate(id) {
    const use = {
      hint: () => this.game.useHint(),
      shuffle: () => this.game.useShuffle(),
      magnet: () => this.game.useMagnet(),
      freeze: () => this.game.useFreeze(),
    };
    const ok = use[id]();
    if (ok) usePowerup(id);
    else this.toast(id === 'freeze' ? 'Already frozen' : 'Not available right now');
    this.refreshCounts();
  }

  #openOutOf(id) {
    const p = powerupById[id];
    this.pendingPowerup = id;
    this.game.pause();
    this.bind('outof-icon').textContent = p.icon;
    this.bind('outof-name').textContent = `${p.label}s`;
    this.$('[data-action="outof-buy"]').disabled = save.coins < POWERUP_PRICE;
    this.$('[data-action="outof-ad"]').disabled = false;
    this.refreshCounts();
    this.show('outof');
  }

  #closeOutOf(useIt = false) {
    const id = this.pendingPowerup;
    this.pendingPowerup = null;
    this.show('outof', false);
    this.game.resume();
    if (useIt && id) this.#activate(id);
  }

  #outOfBuy() {
    if (save.coins < POWERUP_PRICE) return;
    addCoins(-POWERUP_PRICE);
    addPowerup(this.pendingPowerup, 1);
    this.#closeOutOf(true);
  }

  async #outOfAd(btn) {
    btn.disabled = true;
    const granted = await ads.showRewardedAd();
    btn.disabled = false;
    if (!granted || !this.pendingPowerup) return;
    addPowerup(this.pendingPowerup, 1);
    this.#closeOutOf(true);
  }

  // ---------------------------------------------------------------- shop & coins

  #openShop() {
    this.shopReturn = this.isShown('pause') ? 'pause' : 'menu';
    this.show(this.shopReturn, false);
    this.refreshCounts();
    this.show('shop');
  }

  #closeShop() {
    this.show('shop', false);
    this.refreshCounts();
    this.show(this.shopReturn ?? 'menu');
  }

  #buy(id) {
    if (save.coins < POWERUP_PRICE) return this.toast(`Need ${POWERUP_PRICE} coins`);
    addCoins(-POWERUP_PRICE);
    addPowerup(id, 1);
    this.refreshCounts();
    this.toast(`+1 ${powerupById[id].icon} ${powerupById[id].label}`);
  }

  #claimDaily() {
    if (claimDailyGift(DAILY_GIFT_COINS)) this.#coinGain(DAILY_GIFT_COINS);
  }

  async #adCoins(btn) {
    if (adCoinsLeft(AD_COINS_PER_DAY) <= 0) return;
    btn.disabled = true;
    const granted = await ads.showRewardedAd();
    if (granted) {
      recordAdCoins(AD_COINS);
      this.#coinGain(AD_COINS);
    } else {
      this.refreshCounts();
    }
  }

  // ---------------------------------------------------------------- end of level

  #onWin({ timeLeft }) {
    const stars = starsFor(this.level, timeLeft);
    const coins = coinsFor(this.level, stars);
    completeLevel(this.level.number, stars, coins);
    this.lastWinCoins = coins;
    let bonus = '';
    if (stars === 3) {
      const pu = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
      addPowerup(pu.id, 1);
      bonus = `3-star bonus: +1 ${pu.icon} ${pu.label}`;
    }
    this.bind('coins-earned').textContent = coins;
    this.bind('bonus').textContent = bonus;
    const dbl = this.$('[data-action="double"]');
    dbl.disabled = false;
    dbl.classList.remove('hidden');
    [...this.bind('stars').children].forEach((el, i) => {
      el.classList.toggle('on', i < stars);
      el.style.animationDelay = `${0.25 + i * 0.2}s`;
    });
    this.refreshCounts();
    setTimeout(() => this.show('win'), 450);
  }

  async #doubleCoins(btn) {
    btn.disabled = true;
    const granted = await ads.showRewardedAd();
    if (!granted) {
      btn.disabled = false;
      return;
    }
    addCoins(this.lastWinCoins);
    this.bind('coins-earned').textContent = this.lastWinCoins * 2;
    btn.classList.add('hidden');
    this.#coinGain(this.lastWinCoins);
  }

  #onLose() {
    const btn = this.$('[data-action="reward"]');
    btn.disabled = this.rewardUsed;
    btn.classList.toggle('hidden', this.rewardUsed);
    this.show('lose');
  }

  async #rewardTime(btn) {
    btn.disabled = true;
    const granted = await ads.showRewardedAd();
    if (granted && this.game.state === 'lost') {
      this.rewardUsed = true;
      this.show('lose', false);
      this.game.continueWithTime(REWARD_SECONDS);
    } else {
      btn.disabled = false;
    }
  }

  async #next() {
    this.show('win', false);
    if (save.completedCount > 0 && save.completedCount % ads.INTERSTITIAL_EVERY === 0) {
      await ads.showInterstitial();
    }
    this.startLevel(this.level.number + 1);
  }
}
