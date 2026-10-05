// Helpers for composing procedural toy models from primitives.
// Every model is merged into ONE vertex-colored BufferGeometry, so it renders
// in a single draw call with a single shared material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tmpColor = new THREE.Color();
const euler = new THREE.Euler();
const quat = new THREE.Quaternion();
const matrix = new THREE.Matrix4();

/**
 * Prepares a primitive as a model part.
 * @param {THREE.BufferGeometry} geo
 * @param {string|number|((x:number,y:number,z:number)=>string|number)} color
 *        a flat color, or a function of the triangle centroid (in the
 *        primitive's own space) for stripes, spots, icing, etc.
 * @param {{pos?:number[], rot?:number[], scale?:number|number[]}} [t]
 */
export function part(geo, color, t = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    if (typeof color === 'function') {
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      tmpColor.set(color(cx, cy, cz));
    } else {
      tmpColor.set(color);
    }
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = tmpColor.r;
      colors[(i + k) * 3 + 1] = tmpColor.g;
      colors[(i + k) * 3 + 2] = tmpColor.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const s = t.scale ?? 1;
  const sv = Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s);
  euler.set(...(t.rot ?? [0, 0, 0]));
  quat.setFromEuler(euler);
  matrix.compose(new THREE.Vector3(...(t.pos ?? [0, 0, 0])), quat, sv);
  g.applyMatrix4(matrix);
  return g;
}

export function merge(...parts) {
  return mergeGeometries(parts.flat());
}

/** Solid of revolution around Y from [radius, y] pairs. */
export function lathe(points, segments = 16) {
  return new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    segments,
  );
}

/** Rounded box (cheap: box with beveled edges via ExtrudeGeometry). */
export function roundedBox(w, h, d, r = 0.08) {
  const shape = new THREE.Shape();
  const x = -w / 2 + r;
  const y = -h / 2 + r;
  const iw = w - 2 * r;
  const ih = h - 2 * r;
  shape.moveTo(x, y - r);
  shape.lineTo(x + iw, y - r);
  shape.quadraticCurveTo(x + iw + r, y - r, x + iw + r, y);
  shape.lineTo(x + iw + r, y + ih);
  shape.quadraticCurveTo(x + iw + r, y + ih + r, x + iw, y + ih + r);
  shape.lineTo(x, y + ih + r);
  shape.quadraticCurveTo(x - r, y + ih + r, x - r, y + ih);
  shape.lineTo(x - r, y);
  shape.quadraticCurveTo(x - r, y - r, x, y - r);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d - 2 * r,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r * 0.9,
    bevelSegments: 2,
    curveSegments: 3,
  });
  geo.translate(0, 0, -(d - 2 * r) / 2);
  return geo;
}

export function extrudeShape(shape, depth, bevel = 0.05) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geo.center();
  return geo;
}

/** Tiny deterministic hash for speckles/sprinkles that don't flicker. */
export function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
