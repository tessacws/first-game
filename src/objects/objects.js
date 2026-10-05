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
//     color: '#ff4d4d',        // placeholder color (ignored when `model` is set)
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
  { id: 'cube', name: 'Cube', color: '#ff4d4d', shape: 'cube', size: 0.9 },
  { id: 'sphere', name: 'Ball', color: '#3d8bff', shape: 'sphere' },
  { id: 'cone', name: 'Cone', color: '#ff9a1f', shape: 'cone' },
  { id: 'torus', name: 'Donut', color: '#ff6fcf', shape: 'torus' },
  { id: 'capsule', name: 'Pill', color: '#33d17a', shape: 'capsule' },
  { id: 'cylinder', name: 'Can', color: '#ffe14d', shape: 'cylinder' },
  { id: 'star', name: 'Star', color: '#ffc400', shape: 'star' },
  { id: 'pyramid', name: 'Pyramid', color: '#1fc8b4', shape: 'pyramid' },
  { id: 'octahedron', name: 'Crystal', color: '#9b5cff', shape: 'octahedron' },
  { id: 'dodecahedron', name: 'Dodeca', color: '#a6e22e', shape: 'dodecahedron' },
  { id: 'icosahedron', name: 'Icosa', color: '#4de8ff', shape: 'icosahedron' },
  { id: 'tetrahedron', name: 'Tetra', color: '#ff3df0', shape: 'tetrahedron' },
  { id: 'heart', name: 'Heart', color: '#e0103a', shape: 'heart' },
  { id: 'prism', name: 'Prism', color: '#c77a2a', shape: 'prism' },
  { id: 'hexnut', name: 'Hex Nut', color: '#8a9bb5', shape: 'hexnut' },
  { id: 'gem', name: 'Gem', color: '#a8d8ff', shape: 'gem' },
  { id: 'mushroom', name: 'Mushroom', color: '#f2d6b3', shape: 'mushroom' },
  { id: 'cross', name: 'Jack', color: '#f5f5f5', shape: 'cross' },
  { id: 'knot', name: 'Knot', color: '#6a4cff', shape: 'knot' },
  { id: 'bell', name: 'Bell', color: '#d4a017', shape: 'bell' },
  { id: 'starburst', name: 'Sun', color: '#ff7a45', shape: 'starburst' },
  { id: 'barrel', name: 'Barrel', color: '#7d4f2b', shape: 'barrel' },
];

/** Base diameter (world units) every asset is normalized to. */
export const OBJECT_SIZE = 1.35;
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
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: type.color,
    roughness: 0.55,
    metalness: 0.05,
    flatShading: true,
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
    /** amount 0..1 */
    setHighlight(amount) {
      const a = typeof amount === 'number' ? amount : amount ? 1 : 0;
      materials.forEach((m, i) => {
        m.emissive.copy(baseEmissive[i]).lerp(highlightColor, a * 0.85);
      });
    },
  };
}
