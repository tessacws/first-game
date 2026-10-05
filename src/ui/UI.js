// DOM screens and HUD. Owns the flow between menu / game / win / lose and
// drives the Game instance.
import { getLevel, starsFor, coinsFor } from '../levels/levels.js';
import { save, addCoins, addPowerup, usePowerup, completeLevel } from '../game/storage.js';
import * as ads from '../ads.js';

const POWERUP_PRICE = 50;
const REWARD_SECONDS = 30;

const POWERUPS = [
  { id: 'hint', icon: '💡', label: 'Hint' },
  { id: 'shuffle', icon: '🔀', label: 'Shuffle' },
  { id: 'freeze', icon: '❄️', label: 'Freeze' },
];

const html = String.raw;

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
          <div class="coins-pill"><span class="coin">●</span><span data-bind="coins">0</span></div>
        </div>
        <div class="hud-bottom">
          <div class="matchbox">
            <div class="slot"></div>
            <div class="slot"></div>
          </div>
          <div class="powerups">
            ${POWERUPS.map(
              (p) => html`<button class="powerup" data-powerup="${p.id}">
                <span class="pu-icon">${p.icon}</span>
                <span class="pu-label">${p.label}</span>
                <span class="pu-badge" data-bind="pu-${p.id}">0</span>
              </button>`,
            ).join('')}
          </div>
        </div>
      </div>

      <div id="menu" class="screen">
        <div class="panel">
          <h1 class="logo">Pair<br /><span>Pop 3D</span></h1>
          <div class="menu-stats">
            <div class="stat"><small>Level</small><b data-bind="menu-level">1</b></div>
            <div class="stat"><small>Coins</small><b><span class="coin">●</span> <span data-bind="menu-coins">0</span></b></div>
          </div>
          <button class="btn btn-primary btn-big" data-action="play">Play</button>
          <p class="hint-text">Tap objects to put them in the box.<br />Match pairs before time runs out!</p>
        </div>
      </div>

      <div id="pause" class="screen overlay hidden">
        <div class="panel">
          <h2>Paused</h2>
          <button class="btn btn-primary" data-action="resume">Resume</button>
          <button class="btn" data-action="restart">Restart</button>
          <button class="btn btn-ghost" data-action="menu">Menu</button>
        </div>
      </div>

      <div id="win" class="screen overlay hidden">
        <div class="panel">
          <h2>Level Complete!</h2>
          <div class="stars" data-bind="stars">
            <span class="star">★</span><span class="star">★</span><span class="star">★</span>
          </div>
          <div class="reward">+<span data-bind="coins-earned">0</span> <span class="coin">●</span></div>
          <div class="bonus" data-bind="bonus"></div>
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
          return this.#reward(btn);
      }
    });
  }

  bind(name) {
    return this.root.querySelector(`[data-bind="${name}"]`);
  }

  show(id, on = true) {
    this.$(`#${id}`).classList.toggle('hidden', !on);
  }

  /** Measures the HUD and tells the game where the free play area and slots are. */
  layout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const top = this.$('.hud-top').getBoundingClientRect().bottom;
    const bottomTop = this.$('.hud-bottom').getBoundingClientRect().top;
    const slotRects = [...this.root.querySelectorAll('.slot')].map((s) => s.getBoundingClientRect());
    this.game.layout(w, h, top, h - bottomTop, slotRects);
  }

  refreshCounts() {
    this.bind('coins').textContent = save.coins;
    this.bind('menu-coins').textContent = save.coins;
    this.bind('menu-level').textContent = save.level;
    for (const p of POWERUPS) {
      const n = save.powerups[p.id] ?? 0;
      const badge = this.bind(`pu-${p.id}`);
      badge.textContent = n > 0 ? n : `${POWERUP_PRICE}●`;
      badge.classList.toggle('buy', n <= 0);
    }
  }

  toast(text) {
    const t = this.bind('toast');
    t.textContent = text;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  }

  // ---------------------------------------------------------------- flow

  showMenu() {
    this.game.stop();
    this.root.classList.remove('frozen');
    ['hud', 'pause', 'win', 'lose', 'loading'].forEach((id) => this.show(id, false));
    this.show('menu');
    this.refreshCounts();
    ads.showBanner();
  }

  async startLevel(n) {
    ['menu', 'pause', 'win', 'lose'].forEach((id) => this.show(id, false));
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
    const box = this.$('.matchbox');
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
    navigator.vibrate?.(60);
  }

  #usePowerup(id) {
    if (this.game.state !== 'playing') return;
    if ((save.powerups[id] ?? 0) <= 0) {
      if (save.coins < POWERUP_PRICE) return this.toast(`Need ${POWERUP_PRICE} coins`);
      addCoins(-POWERUP_PRICE);
      addPowerup(id, 1);
    }
    const ok =
      id === 'hint' ? this.game.useHint() : id === 'shuffle' ? this.game.useShuffle() : this.game.useFreeze();
    if (ok) usePowerup(id);
    else this.toast(id === 'freeze' ? 'Already frozen' : 'Not available right now');
    this.refreshCounts();
  }

  #onWin({ timeLeft }) {
    const stars = starsFor(this.level, timeLeft);
    const coins = coinsFor(this.level, stars);
    completeLevel(this.level.number, stars, coins);
    let bonus = '';
    if (stars === 3) {
      const pu = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
      addPowerup(pu.id, 1);
      bonus = `3-star bonus: +1 ${pu.icon} ${pu.label}`;
    }
    this.bind('coins-earned').textContent = coins;
    this.bind('bonus').textContent = bonus;
    [...this.bind('stars').children].forEach((el, i) => {
      el.classList.toggle('on', i < stars);
      el.style.animationDelay = `${0.25 + i * 0.2}s`;
    });
    this.refreshCounts();
    setTimeout(() => this.show('win'), 450);
  }

  #onLose() {
    const btn = this.$('[data-action="reward"]');
    btn.disabled = this.rewardUsed;
    btn.classList.toggle('hidden', this.rewardUsed);
    this.show('lose');
  }

  async #reward(btn) {
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
