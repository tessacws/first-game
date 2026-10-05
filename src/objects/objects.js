// Object type registry.
//
// Every pile object is described by an entry in OBJECT_TYPES. Game logic only
// ever talks to this module through `preloadTypes`, `createObject` and
// `getObjectType`, so an entry can switch from a procedural placeholder to a
// .glb model by adding a `model` field — nothing else has to change.
//
//   {
//     id: 'cube',              // unique id, used in level JSON
//     name: 'Cube',            // display name
//     color: '#ff4d4d',        // accent color (pop particles; flat color if a shape has no vertex colors)
//     shape: 'cube',           // key in shapes.js (procedural placeholder)
//     model: 'models/cube.glb' // OPTIONAL: path relative to /public; overrides `shape`
//     size: 1,                 // OPTIONAL: relative size multiplier (default 1)
//   }
//
// All assets are normalized to the same bounding-sphere size and centered, and
// their physics collider is a convex hull built from the asset's vertices, so
// any model works without hand-tuned colliders.
import * as THREE from 'three';
import { shapes } from './shapes.js';

export const OBJECT_TYPES = [
  { id: 'volleyball', name: 'Volleyball', color: '#2f6fdf', shape: 'volleyball' },
  { id: 'basketball', name: 'Basketball', color: '#f57c1f', shape: 'basketball' },
  { id: 'tennis', name: 'Tennis ball', color: '#d4ec3a', shape: 'tennis', size: 0.8 },
  { id: 'soccer', name: 'Football', color: '#fafafa', shape: 'soccer' },
  { id: 'donut', name: 'Donut', color: '#ff7eb9', shape: 'donut' },
  { id: 'burger', name: 'Burger', color: '#f0a94f', shape: 'burger' },
  { id: 'cake', name: 'Cake', color: '#ff9ac2', shape: 'cake' },
  { id: 'toiletroll', name: 'Toilet roll', color: '#f7f7f2', shape: 'toiletroll' },
  { id: 'wheel', name: 'Wheel', color: '#8d939b', shape: 'wheel' },
  { id: 'grapes', name: 'Grapes', color: '#9c4dd8', shape: 'grapes' },
  { id: 'popsicle', name: 'Popsicle', color: '#ff7a3d', shape: 'popsicle' },
  { id: 'watermelon', name: 'Watermelon', color: '#ff4d5e', shape: 'watermelon' },
  { id: 'apple', name: 'Apple', color: '#e53935', shape: 'apple', size: 0.9 },
  { id: 'cherries', name: 'Cherries', color: '#d81b60', shape: 'cherries', size: 0.9 },
  { id: 'strawberry', name: 'Strawberry', color: '#e8283c', shape: 'strawberry', size: 0.85 },
  { id: 'carrot', name: 'Carrot', color: '#ff8c1a', shape: 'carrot' },
  { id: 'cupcake', name: 'Cupcake', color: '#ffc1dc', shape: 'cupcake' },
  { id: 'icecream', name: 'Ice cream', color: '#ff9cc7', shape: 'icecream' },
  { id: 'mushroom', name: 'Mushroom', color: '#e53935', shape: 'mushroom', size: 0.9 },
  { id: 'gift', name: 'Gift', color: '#e53950', shape: 'gift' },
  { id: 'trafficcone', name: 'Traffic cone', color: '#ff6d00', shape: 'trafficcone' },
  { id: 'dice', name: 'Dice', color: '#fafafa', shape: 'dice', size: 0.85 },
  { id: 'duck', name: 'Rubber duck', color: '#ffd60a', shape: 'duck' },
  { id: 'lollipop', name: 'Lollipop', color: '#ff4f8b', shape: 'lollipop' },
  { id: 'mug', name: 'Mug', color: '#3d8bff', shape: 'mug', size: 0.9 },
  { id: 'egg', name: 'Egg', color: '#fff1d6', shape: 'egg', size: 0.8 },
  { id: 'pencil', name: 'Pencil', color: '#ffc107', shape: 'pencil' },
  { id: 'candy', name: 'Candy', color: '#ff3b6b', shape: 'candy' },
  { id: 'pizza', name: 'Pizza', color: '#ffcf48', shape: 'pizza' },
  { id: 'soda', name: 'Soda can', color: '#e3262f', shape: 'soda', size: 0.9 },
  { id: 'crown', name: 'Crown', color: '#ffc928', shape: 'crown', size: 0.9 },
  { id: 'teapot', name: 'Teapot', color: '#26a69a', shape: 'teapot' },
  { id: 'banana', name: 'Banana', color: '#ffe135', shape: 'banana' },
  { id: 'whale', name: 'Whale', color: '#1f4fa8', shape: 'whale' },
  { id: 'star', name: 'Star', color: '#ffc400', shape: 'star', size: 0.9 },
  { id: 'heart', name: 'Heart', color: '#e0103a', shape: 'heart', size: 0.85 },
];

/** Base diameter (world units) every asset is normalized to. */
export const OBJECT_SIZE = 1.1;
const MAX_HULL_POINTS = 256;

const byId = new Map(OBJECT_TYPES.map((t) => [t.id, t]));
const assetCache = new Map(); // id -> Promise<Asset>
let gltfLoaderPromise = null;

export function getObjectType(id) {
  const t = byId.get(id);
  if (!t) throw new Error(`Unknown object type "${id}"`);
  return t;
}

export function allTypeIds() {
  return OBJECT_TYPES.map((t) => t.id);
}

async function loadGLTF(url) {
  if (!gltfLoaderPromise) {
    // Loaded lazily so the GLTF loader is only bundled/fetched when used.
    gltfLoaderPromise = import('three/examples/jsm/loaders/GLTFLoader.js').then(
      (m) => new m.GLTFLoader(),
    );
  }
  const loader = await gltfLoaderPromise;
  const gltf = await loader.loadAsync(import.meta.env.BASE_URL + url);
  return gltf.scene;
}

function buildProcedural(type) {
  const builder = shapes[type.shape];
  if (!builder) throw new Error(`No procedural shape "${type.shape}" for "${type.id}"`);
  const geometry = builder();
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    // Procedural models carry their colors per vertex (see build.js)
    vertexColors: !!geometry.attributes.color,
    color: geometry.attributes.color ? '#ffffff' : type.color,
    roughness: 0.5,
    metalness: 0.0,
  });
  return new THREE.Mesh(geometry, material);
}

/** Collects vertices of every mesh under `root` (in root space), evenly decimated. */
function collectHullPoints(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const pts = [];
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      pts.push(v.x, v.y, v.z);
    }
  });
  const count = pts.length / 3;
  if (count <= MAX_HULL_POINTS) return new Float32Array(pts);
  const out = new Float32Array(MAX_HULL_POINTS * 3);
  const step = count / MAX_HULL_POINTS;
  for (let i = 0; i < MAX_HULL_POINTS; i++) {
    const j = Math.floor(i * step) * 3;
    out[i * 3] = pts[j];
    out[i * 3 + 1] = pts[j + 1];
    out[i * 3 + 2] = pts[j + 2];
  }
  return out;
}

/** Wraps `inner` in a group, centered at the origin and scaled to the target size. */
function normalize(inner, size) {
  const wrapper = new THREE.Group();
  wrapper.add(inner);
  wrapper.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const scale = (OBJECT_SIZE * size) / 2 / (sphere.radius || 1);
  inner.scale.multiplyScalar(scale);
  inner.position.sub(sphere.center.multiplyScalar(scale));
  wrapper.updateMatrixWorld(true);
  return wrapper;
}

async function buildAsset(type) {
  const inner = type.model ? await loadGLTF(type.model) : buildProcedural(type);
  inner.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  const template = normalize(inner, type.size ?? 1);
  const hullPoints = collectHullPoints(template);
  const radius = new THREE.Box3()
    .setFromObject(template)
    .getBoundingSphere(new THREE.Sphere()).radius;
  return { type, template, hullPoints, radius };
}

/** Loads (or builds) the assets for the given type ids. Safe to call repeatedly. */
export function preloadTypes(ids) {
  return Promise.all(
    ids.map((id) => {
      if (!assetCache.has(id)) assetCache.set(id, buildAsset(getObjectType(id)));
      return assetCache.get(id);
    }),
  );
}

/**
 * Creates a new instance of a (preloaded) object type.
 * Returns { object3d, hullPoints, radius, setHighlight(bool|number) }.
 * Each instance gets its own materials so it can be highlighted individually.
 */
export async function createObject(id) {
  const [asset] = await preloadTypes([id]);
  const object3d = asset.template.clone(true);
  const materials = [];
  object3d.traverse((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material)) o.material = o.material.map((m) => m.clone());
    else o.material = o.material.clone();
    for (const m of [].concat(o.material)) {
      if (m.emissive) materials.push(m);
    }
  });
  const baseEmissive = materials.map((m) => m.emissive.clone());
  const highlightColor = new THREE.Color('#fff2a8');
  return {
    object3d,
    hullPoints: asset.hullPoints,
    radius: asset.radius,
    /** accent color, used for particle effects */
    color: asset.type.color ?? '#ffffff',
    /** amount 0..1 */
    setHighlight(amount) {
      const a = typeof amount === 'number' ? amount : amount ? 1 : 0;
      materials.forEach((m, i) => {
        m.emissive.copy(baseEmissive[i]).lerp(highlightColor, a * 0.85);
      });
    },
  };
}
