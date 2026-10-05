// Procedural low-poly placeholder geometries.
// Each builder returns a THREE.BufferGeometry. Size/centering does not matter:
// objects.js normalizes every asset to the same bounding size.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function extrude(shape, depth = 0.4, bevel = 0.06) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 6,
  });
  geo.center();
  return geo;
}

function starShape(points = 5, outer = 1, inner = 0.45) {
  const s = new THREE.Shape();
  for (let i = 0; i <= points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return s;
}

function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.9);
  s.bezierCurveTo(-0.2, -0.65, -1, -0.25, -1, 0.25);
  s.bezierCurveTo(-1, 0.75, -0.45, 0.95, 0, 0.5);
  s.bezierCurveTo(0.45, 0.95, 1, 0.75, 1, 0.25);
  s.bezierCurveTo(1, -0.25, 0.2, -0.65, 0, -0.9);
  return s;
}

function lathe(profile, segments = 10) {
  const pts = profile.map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, segments);
}

function nonIndexed(g) {
  return g.index ? g.toNonIndexed() : g;
}

export const shapes = {
  cube: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.IcosahedronGeometry(0.5, 1),
  cone: () => new THREE.ConeGeometry(0.5, 1, 10),
  torus: () => new THREE.TorusGeometry(0.42, 0.18, 6, 12),
  capsule: () => new THREE.CapsuleGeometry(0.3, 0.6, 3, 8),
  cylinder: () => new THREE.CylinderGeometry(0.45, 0.45, 0.9, 10),
  star: () => extrude(starShape(5), 0.35),
  pyramid: () => new THREE.ConeGeometry(0.6, 0.85, 4),
  octahedron: () => new THREE.OctahedronGeometry(0.55),
  dodecahedron: () => new THREE.DodecahedronGeometry(0.5),
  icosahedron: () => new THREE.IcosahedronGeometry(0.55, 0),
  tetrahedron: () => new THREE.TetrahedronGeometry(0.6),
  heart: () => extrude(heartShape(), 0.4),
  prism: () => new THREE.CylinderGeometry(0.55, 0.55, 0.9, 3),
  hexnut: () => new THREE.TorusGeometry(0.4, 0.2, 4, 6),
  gem: () =>
    lathe(
      [
        [0, -0.6],
        [0.55, 0.05],
        [0.4, 0.3],
        [0, 0.3],
      ],
      8,
    ),
  mushroom: () =>
    lathe(
      [
        [0, -0.5],
        [0.2, -0.5],
        [0.18, 0.05],
        [0.55, 0.05],
        [0.5, 0.25],
        [0.3, 0.42],
        [0, 0.48],
      ],
      10,
    ),
  cross: () => {
    const a = nonIndexed(new THREE.BoxGeometry(1, 0.32, 0.32));
    const b = nonIndexed(new THREE.BoxGeometry(0.32, 1, 0.32));
    const c = nonIndexed(new THREE.BoxGeometry(0.32, 0.32, 1));
    return mergeGeometries([a, b, c]);
  },
  knot: () => new THREE.TorusKnotGeometry(0.35, 0.12, 40, 6),
  bell: () =>
    lathe(
      [
        [0, 0.5],
        [0.12, 0.48],
        [0.2, 0.3],
        [0.28, -0.1],
        [0.5, -0.4],
        [0.48, -0.48],
        [0, -0.48],
      ],
      10,
    ),
  starburst: () => extrude(starShape(8, 1, 0.6), 0.45),
  barrel: () =>
    lathe(
      [
        [0, -0.5],
        [0.38, -0.5],
        [0.48, 0],
        [0.38, 0.5],
        [0, 0.5],
      ],
      8,
    ),
};
