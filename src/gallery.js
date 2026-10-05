// Dev tool: renders every registered object type in a grid.
// Run `npm run dev` and open /gallery.html.
import * as THREE from 'three';
import { OBJECT_TYPES, createObject } from './objects/objects.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#3b3632');
scene.add(new THREE.HemisphereLight('#ffffff', '#5a4a3a', 1.8));
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(2, 6, 4);
scene.add(sun);

const cols = 6;
const gap = 1.5;
const rows = Math.ceil(OBJECT_TYPES.length / cols);
const camera = new THREE.OrthographicCamera();
const items = [];

for (const [i, t] of OBJECT_TYPES.entries()) {
  const obj = await createObject(t.id);
  const o = obj.object3d;
  o.position.set(((i % cols) - (cols - 1) / 2) * gap, -(Math.floor(i / cols) - (rows - 1) / 2) * gap, 0);
  o.rotation.set(0.5, 0.6, 0);
  scene.add(o);
  items.push({ o, t });
}

const labels = document.getElementById('labels');
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  const halfW = (cols * gap) / 2;
  const halfH = (rows * gap) / 2 + 0.3;
  const s = Math.max(halfW / (w / h), halfH);
  Object.assign(camera, { left: (-s * w) / h, right: (s * w) / h, top: s, bottom: -s, near: -10, far: 10 });
  camera.updateProjectionMatrix();
  labels.innerHTML = items
    .map(({ o, t }) => {
      const p = o.position.clone().add(new THREE.Vector3(0, -0.68, 0)).project(camera);
      return `<span style="left:${((p.x + 1) / 2) * w}px;top:${((1 - p.y) / 2) * h}px">${t.name}</span>`;
    })
    .join('');
}
addEventListener('resize', resize);
resize();
renderer.setAnimationLoop((t) => {
  items.forEach(({ o }) => (o.rotation.y = 0.6 + t / 1500));
  renderer.render(scene, camera);
});
