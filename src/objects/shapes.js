// Procedural low-poly toy models (placeholders until real .glb art).
// Each builder returns ONE vertex-colored BufferGeometry. Size and centering
// don't matter: objects.js normalizes every asset to the same size.
import * as THREE from 'three';
import { TeapotGeometry } from 'three/examples/jsm/geometries/TeapotGeometry.js';
import { part, merge, lathe, roundedBox, extrudeShape, hash3 } from './build.js';

const TAU = Math.PI * 2;
const angle = (x, z) => Math.atan2(z, x);

/** Cylinder spanning two points. */
function stick(from, to, r, color, seg = 6) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize(),
  );
  const e = new THREE.Euler().setFromQuaternion(q);
  const mid = a.add(b).multiplyScalar(0.5);
  return part(g, color, { pos: mid.toArray(), rot: [e.x, e.y, e.z] });
}

const sphere = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const SPRINKLES = ['#ffffff', '#4dd0e1', '#ffeb3b', '#7c4dff', '#66bb6a'];

export const shapes = {
  volleyball: () =>
    part(new THREE.IcosahedronGeometry(0.5, 3), (x, y, z) => {
      const ax = Math.abs(x);
      const ay = Math.abs(y);
      const az = Math.abs(z);
      if (ax >= ay && ax >= az) return '#ffffff';
      if (ay >= az) return Math.abs(z) < 0.12 ? '#e53935' : '#ffd23f';
      return Math.abs(x) < 0.12 ? '#ffffff' : '#2f6fdf';
    }),

  basketball: () =>
    part(new THREE.IcosahedronGeometry(0.5, 3), (x, y, z) => {
      const line = 0.035;
      if (Math.abs(x) < line || Math.abs(y) < line) return '#2b1a10';
      if (Math.abs(Math.hypot(x, y) - 0.36) < line) return '#2b1a10';
      return '#f57c1f';
    }),

  tennis: () =>
    part(new THREE.IcosahedronGeometry(0.42, 3), (x, y, z) => {
      const seam = 0.22 * Math.sin(2 * angle(x, z));
      return Math.abs(y - seam) < 0.045 ? '#ffffff' : '#d4ec3a';
    }),

  soccer: () => {
    const dirs = new THREE.IcosahedronGeometry(1, 0).attributes.position;
    const poles = [];
    for (let i = 0; i < dirs.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(dirs, i).normalize();
      if (!poles.some((p) => p.distanceTo(v) < 0.01)) poles.push(v);
    }
    const v = new THREE.Vector3();
    return part(new THREE.IcosahedronGeometry(0.5, 3), (x, y, z) => {
      v.set(x, y, z).normalize();
      return poles.some((p) => p.angleTo(v) < 0.3) ? '#1e1e1e' : '#fafafa';
    });
  },

  donut: () =>
    part(
      new THREE.TorusGeometry(0.36, 0.2, 12, 24),
      (x, y, z) => {
        if (z < -0.03) return '#d9984a';
        const h = hash3(x * 9, y * 9, z * 9);
        if (h > 0.9) return SPRINKLES[Math.floor(h * 1000) % SPRINKLES.length];
        return '#ff7eb9';
      },
      { rot: [-Math.PI / 2, 0, 0] },
    ),

  burger: () =>
    merge(
      part(lathe([[0, 0], [0.5, 0], [0.53, 0.07], [0.48, 0.15], [0, 0.15]], 18), '#e8a24a'),
      part(new THREE.CylinderGeometry(0.53, 0.53, 0.13, 18), '#6b3a1e', { pos: [0, 0.22, 0] }),
      part(new THREE.BoxGeometry(0.85, 0.04, 0.85), '#ffc52e', { pos: [0, 0.3, 0], rot: [0, Math.PI / 4, 0] }),
      part(new THREE.CylinderGeometry(0.57, 0.55, 0.05, 12), '#5cc244', { pos: [0, 0.34, 0] }),
      part(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 16), '#e8402e', { pos: [0, 0.38, 0] }),
      part(
        new THREE.SphereGeometry(0.52, 18, 8, 0, TAU, 0, Math.PI / 2),
        (x, y, z) => (hash3(x * 7, y * 7, z * 7) > 0.93 ? '#fff3d6' : '#f0a94f'),
        { pos: [0, 0.4, 0], scale: [1, 0.62, 1] },
      ),
    ),

  cake: () => {
    const wedge = () => {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(0.9, -0.38);
      s.quadraticCurveTo(0.98, 0, 0.9, 0.38);
      s.lineTo(0, 0);
      return s;
    };
    const layer = (d, color, y) =>
      part(extrudeShape(wedge(), d, 0.02), color, { pos: [0, y, 0], rot: [-Math.PI / 2, 0, 0] });
    return merge(
      layer(0.16, '#f4d19b', 0),
      layer(0.04, '#fffaf0', 0.13),
      layer(0.16, '#f4d19b', 0.25),
      layer(0.06, '#ff9ac2', 0.38),
      part(sphere(0.09), '#d50032', { pos: [0.62, 0.48, 0] }),
    );
  },

  toiletroll: () =>
    part(
      lathe(
        [
          [0.14, -0.32],
          [0.4, -0.32],
          [0.43, -0.29],
          [0.43, 0.29],
          [0.4, 0.32],
          [0.14, 0.32],
          [0.14, -0.32],
        ],
        20,
      ),
      (x, y, z) => (Math.hypot(x, z) < 0.2 ? '#b88a5a' : '#f7f7f2'),
    ),

  wheel: () =>
    merge(
      part(new THREE.TorusGeometry(0.36, 0.16, 10, 24), '#262626'),
      part(
        new THREE.CylinderGeometry(0.3, 0.3, 0.2, 20),
        (x, y, z) => {
          const r = Math.hypot(x, z);
          if (r < 0.08) return '#7a8088';
          const spoke = Math.abs(Math.sin(angle(x, z) * 2.5)) < 0.35;
          return spoke ? '#d5d9de' : '#8d939b';
        },
        { rot: [Math.PI / 2, 0, 0] },
      ),
    ),

  grapes: () => {
    const parts = [];
    const rows = [
      [0.32, 4, 0.2],
      [0.1, 5, 0.24],
      [-0.12, 4, 0.18],
      [-0.32, 2, 0.1],
      [-0.48, 1, 0],
    ];
    rows.forEach(([y, n, r], ri) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + ri;
        const shade = (i + ri) % 3 === 0 ? '#7b2fbe' : '#9c4dd8';
        parts.push(part(sphere(0.15, 10, 8), shade, { pos: [Math.cos(a) * r, y, Math.sin(a) * r] }));
      }
    });
    parts.push(part(sphere(0.15, 10, 8), '#8e44c9', { pos: [0, 0.2, 0] }));
    parts.push(stick([0, 0.4, 0], [0.05, 0.62, 0], 0.035, '#6d8a2a'));
    return merge(parts);
  },

  popsicle: () =>
    merge(
      part(roundedBox(0.5, 0.82, 0.22, 0.11), (x, y) => (y > 0.08 ? '#ff7a3d' : '#ffd23f')),
      part(roundedBox(0.12, 0.48, 0.05, 0.025), '#e2c08d', { pos: [0, -0.6, 0] }),
    ),

  watermelon: () => {
    const half = (r) => {
      const s = new THREE.Shape();
      s.absarc(0, 0, r, Math.PI, TAU, false);
      s.lineTo(-r, 0);
      return s;
    };
    const seeds = [];
    for (const [x, y] of [[-0.25, -0.15], [0, -0.28], [0.25, -0.15], [-0.12, -0.08], [0.12, -0.08]]) {
      seeds.push(part(sphere(0.035, 6, 4), '#1d1d1d', { pos: [x, y, 0.13], scale: [1, 1.6, 0.6] }));
    }
    return merge(
      part(extrudeShape(half(0.62), 0.22, 0.03), '#2f8f3a'),
      part(extrudeShape(half(0.55), 0.24, 0.02), '#e8f5c8', { pos: [0, 0.03, 0] }),
      part(extrudeShape(half(0.5), 0.26, 0.02), '#ff4d5e', { pos: [0, 0.05, 0] }),
      ...seeds.map((g) => {
        g.translate(0, 0.05, 0);
        return g;
      }),
    );
  },

  apple: () =>
    merge(
      part(
        lathe([[0, -0.38], [0.22, -0.42], [0.42, -0.25], [0.46, 0.05], [0.38, 0.3], [0.18, 0.36], [0, 0.28]], 18),
        '#e53935',
      ),
      stick([0, 0.26, 0], [0.04, 0.5, 0], 0.03, '#6d4c2f'),
      part(sphere(0.12, 8, 6), '#4caf50', { pos: [0.14, 0.44, 0], scale: [1.5, 0.3, 0.8], rot: [0, 0, 0.4] }),
    ),

  cherries: () =>
    merge(
      part(sphere(0.2), '#c2185b', { pos: [-0.22, -0.3, 0] }),
      part(sphere(0.2), '#d81b60', { pos: [0.22, -0.34, 0.04] }),
      stick([-0.2, -0.12, 0], [0, 0.42, 0], 0.025, '#558b2f'),
      stick([0.2, -0.16, 0.03], [0, 0.42, 0], 0.025, '#558b2f'),
      part(sphere(0.1, 8, 6), '#7cb342', { pos: [0.1, 0.42, 0], scale: [1.6, 0.4, 0.8] }),
    ),

  strawberry: () =>
    merge(
      part(
        lathe([[0, -0.45], [0.18, -0.32], [0.34, -0.02], [0.36, 0.18], [0.24, 0.3], [0, 0.32]], 16),
        (x, y, z) => (hash3(x * 11, y * 11, z * 11) > 0.88 ? '#ffe08a' : '#e8283c'),
      ),
      part(new THREE.CylinderGeometry(0.34, 0.2, 0.05, 7), '#3fae4a', { pos: [0, 0.32, 0] }),
      stick([0, 0.32, 0], [0, 0.46, 0], 0.03, '#3fae4a'),
    ),

  carrot: () =>
    merge(
      part(
        new THREE.ConeGeometry(0.17, 0.85, 12, 6),
        (x, y) => (Math.abs(Math.sin(y * 28)) < 0.12 ? '#e06d0c' : '#ff8c1a'),
        { rot: [Math.PI, 0, 0] },
      ),
      part(new THREE.ConeGeometry(0.05, 0.35, 5), '#43a047', { pos: [0, 0.58, 0] }),
      part(new THREE.ConeGeometry(0.05, 0.3, 5), '#43a047', { pos: [0.07, 0.55, 0], rot: [0, 0, -0.4] }),
      part(new THREE.ConeGeometry(0.05, 0.3, 5), '#43a047', { pos: [-0.07, 0.55, 0], rot: [0, 0, 0.4] }),
    ),

  cupcake: () =>
    merge(
      part(lathe([[0, -0.38], [0.27, -0.38], [0.36, 0.02], [0, 0.02]], 16), (x, y, z) =>
        Math.floor(((angle(x, z) + Math.PI) / TAU) * 16) % 2 ? '#4fc3f7' : '#e1f5fe',
      ),
      part(
        lathe(
          [[0, 0], [0.4, 0.02], [0.42, 0.1], [0.3, 0.17], [0.33, 0.23], [0.2, 0.33], [0.1, 0.43], [0, 0.46]],
          16,
        ),
        (x, y, z) => {
          const h = hash3(x * 9, y * 9, z * 9);
          return h > 0.92 ? SPRINKLES[Math.floor(h * 1000) % SPRINKLES.length] : '#ffc1dc';
        },
        { pos: [0, 0.02, 0] },
      ),
      part(sphere(0.09), '#d50032', { pos: [0, 0.54, 0] }),
    ),

  icecream: () =>
    merge(
      part(new THREE.ConeGeometry(0.28, 0.72, 14, 6), (x, y, z) =>
        Math.floor(angle(x, z) * 3 + y * 10) % 2 ? '#d9963f' : '#e8b36a',
        { pos: [0, -0.3, 0], rot: [Math.PI, 0, 0] },
      ),
      part(sphere(0.31), '#ff9cc7', { pos: [0, 0.12, 0] }),
      part(sphere(0.25), '#8b5a3c', { pos: [0, 0.45, 0] }),
    ),

  mushroom: () => {
    const spots = [[0, 1, 0], [0.7, 0.6, 0.3], [-0.6, 0.6, 0.5], [0.1, 0.6, -0.8], [-0.5, 0.5, -0.6], [0.6, 0.4, -0.6]].map(
      (d) => new THREE.Vector3(...d).normalize(),
    );
    const v = new THREE.Vector3();
    return merge(
      part(
        new THREE.SphereGeometry(0.5, 18, 9, 0, TAU, 0, Math.PI / 2),
        (x, y, z) => {
          v.set(x, y / 0.7, z).normalize();
          return spots.some((s) => s.angleTo(v) < 0.22) ? '#ffffff' : '#e53935';
        },
        { pos: [0, 0.05, 0], scale: [1, 0.7, 1] },
      ),
      part(lathe([[0, -0.42], [0.18, -0.42], [0.2, -0.2], [0.15, 0.06], [0, 0.06]], 12), '#f5ead6'),
    );
  },

  gift: () =>
    merge(
      part(roundedBox(0.8, 0.6, 0.8, 0.05), '#e53950'),
      part(new THREE.BoxGeometry(0.16, 0.62, 0.82), '#ffd23f'),
      part(new THREE.BoxGeometry(0.82, 0.62, 0.16), '#ffd23f'),
      part(new THREE.TorusGeometry(0.12, 0.045, 6, 12), '#ffd23f', { pos: [-0.11, 0.38, 0], rot: [0, 0, 0.6] }),
      part(new THREE.TorusGeometry(0.12, 0.045, 6, 12), '#ffd23f', { pos: [0.11, 0.38, 0], rot: [0, 0, -0.6] }),
    ),

  trafficcone: () =>
    merge(
      part(lathe([[0, -0.33], [0.3, -0.33], [0.07, 0.5], [0, 0.5]], 16), (x, y) =>
        (y > -0.08 && y < 0.1) || (y > 0.25 && y < 0.36) ? '#ffffff' : '#ff6d00',
      ),
      part(roundedBox(0.76, 0.08, 0.76, 0.03), '#e65100', { pos: [0, -0.37, 0] }),
    ),

  dice: () => {
    const pips = [];
    const o = 0.18;
    const face = {
      1: [[0, 0]],
      2: [[-o, -o], [o, o]],
      3: [[-o, -o], [0, 0], [o, o]],
      4: [[-o, -o], [o, o], [-o, o], [o, -o]],
      5: [[-o, -o], [o, o], [-o, o], [o, -o], [0, 0]],
      6: [[-o, -o], [o, o], [-o, o], [o, -o], [-o, 0], [o, 0]],
    };
    const pip = (pos, rot) => part(sphere(0.06, 8, 6), '#1e1e1e', { pos, rot, scale: [1, 0.35, 1] });
    const s = 0.355;
    face[1].forEach(([u, v]) => pips.push(pip([u, s, v], [0, 0, 0])));
    face[6].forEach(([u, v]) => pips.push(pip([u, -s, v], [0, 0, 0])));
    face[2].forEach(([u, v]) => pips.push(pip([s, u, v], [0, 0, Math.PI / 2])));
    face[5].forEach(([u, v]) => pips.push(pip([-s, u, v], [0, 0, Math.PI / 2])));
    face[3].forEach(([u, v]) => pips.push(pip([u, v, s], [Math.PI / 2, 0, 0])));
    face[4].forEach(([u, v]) => pips.push(pip([u, v, -s], [Math.PI / 2, 0, 0])));
    return merge(part(roundedBox(0.7, 0.7, 0.7, 0.1), '#fafafa'), pips);
  },

  duck: () =>
    merge(
      part(sphere(0.4), '#ffd60a', { scale: [1.25, 0.82, 1] }),
      part(sphere(0.26), '#ffd60a', { pos: [0.3, 0.4, 0] }),
      part(new THREE.ConeGeometry(0.1, 0.22, 8), '#ff8f00', {
        pos: [0.6, 0.37, 0],
        rot: [0, 0, -Math.PI / 2],
        scale: [1, 1, 0.6],
      }),
      part(sphere(0.045, 6, 4), '#111', { pos: [0.44, 0.5, 0.15] }),
      part(sphere(0.045, 6, 4), '#111', { pos: [0.44, 0.5, -0.15] }),
      part(new THREE.ConeGeometry(0.14, 0.25, 8), '#ffd60a', { pos: [-0.5, 0.15, 0], rot: [0, 0, 1.0] }),
    ),

  lollipop: () =>
    merge(
      part(
        new THREE.CylinderGeometry(0.42, 0.42, 0.14, 24),
        (x, y, z) => (Math.floor(((angle(x, z) + Math.PI) / TAU) * 10) % 2 ? '#ff4f8b' : '#fff3f8'),
        { rot: [Math.PI / 2, 0, 0] },
      ),
      stick([0, -0.38, 0], [0, -1.0, 0], 0.04, '#ffffff'),
    ),

  mug: () =>
    merge(
      part(
        lathe(
          [[0, -0.35], [0.33, -0.35], [0.35, -0.3], [0.35, 0.35], [0.3, 0.35], [0.3, -0.27], [0, -0.27]],
          18,
        ),
        (x, y, z) => (Math.hypot(x, z) < 0.31 ? (y < -0.2 ? '#5d3a1a' : '#eef3ff') : '#3d8bff'),
      ),
      part(new THREE.TorusGeometry(0.17, 0.05, 6, 14, Math.PI), '#3d8bff', {
        pos: [0.34, 0, 0],
        rot: [0, 0, -Math.PI / 2],
      }),
    ),

  egg: () =>
    part(lathe([[0, -0.42], [0.25, -0.36], [0.33, -0.1], [0.28, 0.2], [0.15, 0.37], [0, 0.42]], 16), '#fff1d6'),

  pencil: () =>
    merge(
      part(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6), '#ffc107'),
      part(new THREE.ConeGeometry(0.1, 0.2, 6), (x, y) => (y > 0.04 ? '#3a3a3a' : '#f1c27d'), {
        pos: [0, 0.5, 0],
      }),
      part(new THREE.CylinderGeometry(0.105, 0.105, 0.08, 10), '#b0bec5', { pos: [0, -0.44, 0] }),
      part(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 10), '#ff8a9a', { pos: [0, -0.54, 0] }),
    ),

  candy: () =>
    merge(
      part(sphere(0.28), (x, y, z) => (Math.floor((x + y) * 9) % 2 ? '#ff3b6b' : '#ffffff'), {
        scale: [1.25, 1, 1],
      }),
      part(new THREE.ConeGeometry(0.2, 0.28, 8), '#ff3b6b', { pos: [-0.46, 0, 0], rot: [0, 0, -Math.PI / 2] }),
      part(new THREE.ConeGeometry(0.2, 0.28, 8), '#ff3b6b', { pos: [0.46, 0, 0], rot: [0, 0, Math.PI / 2] }),
    ),

  pizza: () => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.5);
    s.lineTo(0.42, 0.4);
    s.lineTo(-0.42, 0.4);
    s.lineTo(0, -0.5);
    const top = (x, z) =>
      part(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 10), '#c62828', { pos: [x, 0.07, z] });
    return merge(
      part(extrudeShape(s, 0.08, 0.02), '#ffcf48', { rot: [-Math.PI / 2, 0, 0] }),
      part(roundedBox(0.95, 0.14, 0.16, 0.06), '#d18a3a', { pos: [0, 0.03, -0.42] }),
      top(0, 0.05),
      top(-0.14, -0.2),
      top(0.15, -0.18),
    );
  },

  soda: () =>
    part(new THREE.CylinderGeometry(0.28, 0.28, 0.78, 18, 8), (x, y, z) => {
      if (y > 0.37 || y < -0.37) return '#c9cdd2';
      const wave = 0.06 * Math.sin(angle(x, z) * 2);
      return Math.abs(y - wave) < 0.07 ? '#ffffff' : '#e3262f';
    }),

  crown: () => {
    const parts = [
      part(lathe([[0.36, -0.15], [0.4, -0.15], [0.4, 0.08], [0.36, 0.08], [0.36, -0.15]], 18), '#ffc928'),
    ];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      parts.push(
        part(new THREE.ConeGeometry(0.1, 0.28, 6), '#ffc928', {
          pos: [Math.cos(a) * 0.38, 0.22, Math.sin(a) * 0.38],
        }),
        part(sphere(0.05, 6, 4), '#e53935', { pos: [Math.cos(a) * 0.4, -0.03, Math.sin(a) * 0.4] }),
      );
    }
    return merge(parts);
  },

  teapot: () => part(new TeapotGeometry(0.35, 4), '#26a69a'),

  banana: () => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.5, 0.25, 0),
      new THREE.Vector3(0, -0.35, 0),
      new THREE.Vector3(0.5, 0.25, 0),
    );
    return part(new THREE.TubeGeometry(curve, 14, 0.12, 8, false), (x, y) =>
      Math.abs(x) > 0.44 ? '#6d4c2f' : '#ffe135',
    );
  },

  whale: () =>
    merge(
      part(sphere(0.42, 16, 12), (x, y) => (y < -0.12 ? '#e3f2fd' : '#1f4fa8'), { scale: [1.35, 0.85, 0.95] }),
      part(new THREE.ConeGeometry(0.16, 0.4, 8), '#1f4fa8', { pos: [-0.65, 0.12, 0], rot: [0, 0, 1.2] }),
      part(sphere(0.14, 8, 6), '#1f4fa8', { pos: [-0.82, 0.3, 0.1], scale: [1, 0.3, 1.6] }),
      part(sphere(0.04, 6, 4), '#111', { pos: [0.38, 0.08, 0.3] }),
      part(sphere(0.04, 6, 4), '#111', { pos: [0.38, 0.08, -0.3] }),
    ),

  star: () => {
    const s = new THREE.Shape();
    for (let i = 0; i <= 10; i++) {
      const r = i % 2 === 0 ? 0.55 : 0.24;
      const a = (i / 10) * TAU + Math.PI / 2;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return part(extrudeShape(s, 0.18, 0.06), '#ffc400');
  },

  heart: () => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.45);
    s.bezierCurveTo(-0.1, -0.33, -0.5, -0.13, -0.5, 0.13);
    s.bezierCurveTo(-0.5, 0.38, -0.23, 0.48, 0, 0.25);
    s.bezierCurveTo(0.23, 0.48, 0.5, 0.38, 0.5, 0.13);
    s.bezierCurveTo(0.5, -0.13, 0.1, -0.33, 0, -0.45);
    return part(extrudeShape(s, 0.2, 0.07), '#e0103a');
  },
};
