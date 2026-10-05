// The bowl: visual mesh + static Rapier colliders.
import * as THREE from 'three';

export const BOWL = {
  floorRadius: 3.4,
  rimRadius: 4.5,
  rimHeight: 2.0,
  segments: 18,
  wallThickness: 0.3,
  /** invisible walls above the rim keep dropped objects inside */
  fenceHeight: 14,
};

export function createBowlMesh() {
  const { floorRadius: fr, rimRadius: rr, rimHeight: rh } = BOWL;
  const profile = [
    [0, -0.25],
    [fr + 0.2, -0.25],
    [rr + 0.35, rh],
    [rr + 0.35, rh + 0.15],
    [rr - 0.05, rh + 0.15],
    [rr, rh],
    [fr, 0],
    [0, 0],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(profile, 40);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: '#2d2a6e',
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'bowl';

  // Soft inner floor disc to brighten the play area
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(fr, 40),
    new THREE.MeshStandardMaterial({ color: '#433f9a', roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.005;
  floor.receiveShadow = true;
  mesh.add(floor);
  return mesh;
}

export function createBowlColliders(RAPIER, world) {
  const { floorRadius: fr, rimRadius: rr, rimHeight: rh, segments, wallThickness: t } = BOWL;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

  // Floor
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(rr + 2, 0.5, rr + 2).setTranslation(0, -0.5, 0).setFriction(0.8),
    body,
  );

  const dr = rr - fr;
  const wallLen = Math.hypot(dr, rh);
  const tilt = Math.atan2(dr, rh);
  const halfWidth = (Math.PI * rr) / segments + 0.15;
  const qX = new THREE.Quaternion();
  const qY = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const axisX = new THREE.Vector3(1, 0, 0);
  const axisY = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const radial = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));

    // Slanted wall
    qX.setFromAxisAngle(axisX, tilt);
    qY.setFromAxisAngle(axisY, a);
    q.multiplyQuaternions(qY, qX);
    const normal = new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt)).applyQuaternion(qY);
    const mid = radial
      .clone()
      .multiplyScalar((fr + rr) / 2)
      .setY(rh / 2)
      .addScaledVector(normal, t / 2);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfWidth, wallLen / 2 + 0.2, t / 2)
        .setTranslation(mid.x, mid.y, mid.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setFriction(0.5),
      body,
    );

    // Vertical invisible fence above the rim
    q.copy(qY);
    const fenceH = BOWL.fenceHeight;
    const fp = radial.clone().multiplyScalar(rr + t / 2).setY(rh + fenceH / 2);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfWidth, fenceH / 2, t / 2)
        .setTranslation(fp.x, fp.y, fp.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setFriction(0.2),
      body,
    );
  }
  return body;
}
