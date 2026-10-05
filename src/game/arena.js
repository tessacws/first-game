// The play area: a flat table seen from above, with invisible walls that keep
// the pile inside a rectangle. The rectangle is resized per level so small
// levels fill the screen as much as big ones.
import * as THREE from 'three';

export const TABLE_COLOR = '#2f2b28';
export const WALL_HEIGHT = 14;

function vignetteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, '#5a534c');
  grad.addColorStop(0.55, '#46403a');
  grad.addColorStop(1, TABLE_COLOR);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createTableMesh() {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ map: vignetteTexture(), roughness: 0.95 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.name = 'table';
  return mesh;
}

/** Scales the table so it covers the whole view around a width×depth play area. */
export function sizeTableMesh(mesh, width, depth) {
  const s = Math.max(width, depth) * 2.6;
  mesh.scale.set(s, s, 1);
}

/** Creates a fixed body with a floor and four invisible walls. Returns the body. */
export function createTableColliders(RAPIER, world, width, depth) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const t = 0.5;
  const h = WALL_HEIGHT / 2;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(width, 0.5, depth).setTranslation(0, -0.5, 0).setFriction(0.9),
    body,
  );
  const walls = [
    [width / 2 + t, h, 0, t, h, depth / 2 + t],
    [-width / 2 - t, h, 0, t, h, depth / 2 + t],
    [0, h, depth / 2 + t, width / 2 + t, h, t],
    [0, h, -depth / 2 - t, width / 2 + t, h, t],
  ];
  for (const [x, y, z, hx, hy, hz] of walls) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.3),
      body,
    );
  }
  return body;
}

/** A brushed-metal dish split in two halves: the 2-slot match plate. Radius 1. */
export function createPlateMesh() {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#c3c8cf', roughness: 0.35, metalness: 0.35 });
  const inner = new THREE.MeshStandardMaterial({ color: '#8f969f', roughness: 0.5, metalness: 0.3 });

  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.88, 0.06, 40), inner);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 10, 48), metal);
  rim.rotation.x = Math.PI / 2;
  const divider = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.8), metal);
  divider.position.y = 0.04;
  // inner sheen ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.015, 6, 48), metal);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.035;
  group.add(dish, rim, divider, ring);
  return group;
}
