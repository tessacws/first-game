// Minimal frame-driven tweens (no dependency, advanced by the game loop).
export const ease = {
  linear: (k) => k,
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  outBack: (k) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  },
  inBack: (k) => {
    const c1 = 1.70158;
    return (c1 + 1) * k * k * k - c1 * k * k;
  },
};

export class Tweens {
  constructor() {
    this.list = [];
  }

  /** update(k) is called with eased progress 0..1. Returns a promise resolved on completion. */
  add(duration, update, easing = ease.outCubic) {
    return new Promise((resolve) => {
      this.list.push({ t: 0, duration, update, easing, resolve });
    });
  }

  wait(duration) {
    return this.add(duration, () => {});
  }

  tick(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.duration);
      tw.update(tw.easing(k));
      if (k >= 1) {
        this.list.splice(i, 1);
        tw.resolve();
      }
    }
  }

  clear() {
    this.list.length = 0;
  }
}
