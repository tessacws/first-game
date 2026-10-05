// Core game: rendering, physics, the pile, the 2-slot match box, power-ups.
// UI talks to this class only through its public methods and the `events`
// callbacks passed to the constructor.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { OBJECT_SIZE, createObject, preloadTypes } from '../objects/objects.js';
import { BOWL, createBowlColliders, createBowlMesh } from './arena.js';
import { Particles } from './particles.js';
import { Tweens, ease } from './tween.js';

const FIXED_DT = 1 / 60;
const FREEZE_SECONDS = 10;
const HINT_SECONDS = 4;
const SLOT_DISTANCE = 6; // distance from camera at which match-box items float
const CAMERA_ELEVATION = THREE.MathUtils.degToRad(70);
const FIT_RADIUS = BOWL.rimRadius + 0.3;
const SPAWN_RADIUS = BOWL.floorRadius - 0.6;
const SPAWN_SPACING = OBJECT_SIZE * 1.05;

let rapierReady = null;
export function initPhysics() {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

function noop() {}

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} events  onTime(t), onWin({timeLeft}), onLose(), onMatch(), onMismatch(), onFreezeChange(bool)
   */
  constructor(canvas, events = {}) {
    this.canvas = canvas;
    this.events = {
      onTime: noop,
      onWin: noop,
      onLose: noop,
      onMatch: noop,
      onMismatch: noop,
      onFreezeChange: noop,
      ...events,
    };
    this.state = 'idle'; // idle | loading | playing | paused | won | lost
    this.items = [];
    this.slots = [
      { item: null, pos: new THREE.Vector3(), scale: 1 },
      { item: null, pos: new THREE.Vector3(), scale: 1 },
    ];
    this.timeLeft = 0;
    this.freezeLeft = 0;
    this.hint = null;
    this.resolving = false;
    this.accumulator = 0;
    this.elapsed = 0;
    this.loadToken = 0;
    this.layoutInfo = { top: 0, bottom: 0, slotRects: [] };

    this.#setupRenderer();
    this.#setupScene();
    this.#setupPhysics();
    this.tweens = new Tweens();
    this.particles = new Particles(this.scene);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    canvas.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    this.timer = new THREE.Timer();
    this.renderer.setAnimationLoop(() => this.#frame());
  }

  // ---------------------------------------------------------------- setup

  #setupRenderer() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: dpr < 2, // high-DPR screens don't need MSAA; saves fill-rate
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
  }

  #setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1b1640');
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 80);
    this.scene.add(this.camera);

    this.scene.add(new THREE.HemisphereLight('#dfe8ff', '#3a2a60', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(3, 12, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const s = sun.shadow.camera;
    s.left = s.bottom = -6;
    s.right = s.top = 6;
    s.near = 1;
    s.far = 30;
    sun.shadow.bias = -0.002;
    this.scene.add(sun);

    // Lights items in the match box (they sit near the camera)
    const fill = new THREE.PointLight('#ffffff', 25, 12, 2);
    fill.position.set(0, 0, 0);
    this.camera.add(fill);

    this.bowl = createBowlMesh();
    this.scene.add(this.bowl);
  }

  #setupPhysics() {
    this.world = new RAPIER.World({ x: 0, y: -14, z: 0 });
    this.world.timestep = FIXED_DT;
    createBowlColliders(RAPIER, this.world);
  }

  // ---------------------------------------------------------------- layout

  /**
   * @param {number} width  canvas CSS width
   * @param {number} height canvas CSS height
   * @param {number} top    px covered by the HUD at the top
   * @param {number} bottom px covered by match box + buttons at the bottom
   * @param {DOMRect[]} slotRects  screen rects of the two match-box slots
   */
  layout(width, height, top, bottom, slotRects) {
    this.layoutInfo = { width, height, top, bottom, slotRects };
    this.renderer.setSize(width, height, false);
    const cam = this.camera;
    cam.aspect = width / height;

    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const tanH = tanV * cam.aspect;
    const avail = Math.max(0.3, (height - top - bottom) / height);
    const distW = (FIT_RADIUS * 1.02) / tanH;
    const vertExtent = FIT_RADIUS * Math.sin(CAMERA_ELEVATION) + BOWL.rimHeight * Math.cos(CAMERA_ELEVATION);
    const distH = vertExtent / (tanV * avail);
    const dist = Math.max(distW, distH);

    const target = new THREE.Vector3(0, BOWL.rimHeight * 0.35, 0);
    cam.position.set(
      0,
      target.y + dist * Math.sin(CAMERA_ELEVATION),
      dist * Math.cos(CAMERA_ELEVATION),
    );
    cam.lookAt(target);

    // Shift the projection so the bowl is centered in the free area between
    // the HUD and the match box instead of the middle of the screen.
    const centerY = top + (height - top - bottom) / 2;
    cam.setViewOffset(width, height, 0, height / 2 - centerY, width, height);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    // Match-box slot anchors in world space
    const worldPerPx = (2 * SLOT_DISTANCE * tanV) / height;
    slotRects.forEach((r, i) => {
      const slot = this.slots[i];
      const ndc = new THREE.Vector3(
        ((r.left + r.width / 2) / width) * 2 - 1,
        -((r.top + r.height / 2) / height) * 2 + 1,
        0.5,
      );
      ndc.unproject(cam);
      const dir = ndc.sub(cam.position).normalize();
      slot.pos.copy(cam.position).addScaledVector(dir, SLOT_DISTANCE);
      slot.scale = (Math.min(r.width, r.height) * 0.72 * worldPerPx) / OBJECT_SIZE;
      if (slot.item && slot.item.state === 'slot') {
        slot.item.obj.object3d.position.copy(slot.pos);
        slot.item.obj.object3d.scale.setScalar(slot.scale);
      }
    });
  }

  // ---------------------------------------------------------------- level lifecycle

  async loadLevel(level) {
    const token = ++this.loadToken;
    this.state = 'loading';
    this.#clear();
    await preloadTypes(level.types);
    const created = await Promise.all(
      level.types.flatMap((id) => [createObject(id), createObject(id)]),
    );
    if (token !== this.loadToken) {
      // A newer load started while we were waiting; throw these away.
      created.forEach((o) => this.#disposeObject(o.object3d));
      return;
    }
    const typeIds = level.types.flatMap((id) => [id, id]);
    this.items = created.map((obj, i) => ({
      uid: i,
      typeId: typeIds[i],
      obj,
      body: null,
      state: 'pile',
    }));
    for (const it of this.items) it.obj.object3d.userData.item = it;

    const spawns = this.#spawnPoints(this.items.length);
    shuffleInPlace(this.items).forEach((it, i) => {
      this.scene.add(it.obj.object3d);
      this.#createBody(it, spawns[i], randomQuat());
    });

    // Pre-settle a little so the first frame isn't a mid-air explosion.
    for (let i = 0; i < 30; i++) this.world.step();
    this.#syncPile();

    this.level = level;
    this.timeLeft = level.time;
    this.freezeLeft = 0;
    this.events.onFreezeChange(false);
    this.events.onTime(this.timeLeft);
    this.state = 'playing';
  }

  pause() {
    if (this.state === 'playing') this.state = 'paused';
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'playing';
    }
  }

  /** After losing: continue with extra time (rewarded ad). */
  continueWithTime(seconds) {
    if (this.state !== 'lost') return;
    this.timeLeft = seconds;
    this.state = 'playing';
    this.events.onTime(this.timeLeft);
  }

  /** Removes everything from the arena (used when leaving to the menu). */
  stop() {
    this.loadToken++;
    this.#clear();
    this.state = 'idle';
  }

  #clear() {
    this.tweens.clear();
    for (const it of this.items) {
      if (it.body) this.world.removeRigidBody(it.body);
      this.scene.remove(it.obj.object3d);
      this.#disposeObject(it.obj.object3d);
    }
    this.items = [];
    this.slots.forEach((s) => (s.item = null));
    this.hint = null;
    this.resolving = false;
    if (this.freezeLeft > 0) this.events.onFreezeChange(false);
    this.freezeLeft = 0;
  }

  #disposeObject(o) {
    // Geometries are shared with the cached template; only materials are per-instance.
    o.traverse((m) => {
      if (m.isMesh) [].concat(m.material).forEach((mat) => mat.dispose());
    });
  }

  // ---------------------------------------------------------------- physics helpers

  #spawnPoints(count) {
    const ring = [];
    for (let x = -SPAWN_RADIUS; x <= SPAWN_RADIUS; x += SPAWN_SPACING) {
      for (let z = -SPAWN_RADIUS; z <= SPAWN_RADIUS; z += SPAWN_SPACING) {
        if (x * x + z * z <= SPAWN_RADIUS * SPAWN_RADIUS) ring.push([x, z]);
      }
    }
    const pts = [];
    for (let layer = 0; pts.length < count; layer++) {
      const y = 1.2 + layer * SPAWN_SPACING;
      const off = layer % 2 ? SPAWN_SPACING / 2 : 0;
      for (const [x, z] of shuffleInPlace(ring.slice())) {
        if (pts.length >= count) break;
        const jx = (Math.random() - 0.5) * 0.15;
        const jz = (Math.random() - 0.5) * 0.15;
        const px = clampToRadius(x + off + jx, z + off + jz, SPAWN_RADIUS);
        pts.push(new THREE.Vector3(px[0], y, px[1]));
      }
    }
    return pts;
  }

  #createBody(item, pos, quat, linvel) {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setLinearDamping(0.15)
      .setAngularDamping(0.5)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(desc);
    const cd =
      RAPIER.ColliderDesc.convexHull(item.obj.hullPoints) ?? RAPIER.ColliderDesc.ball(item.obj.radius);
    cd.setFriction(0.7).setRestitution(0.1).setDensity(1);
    this.world.createCollider(cd, body);
    if (linvel) body.setLinvel(linvel, true);
    item.body = body;
    const o = item.obj.object3d;
    o.position.copy(pos);
    o.quaternion.copy(quat);
    o.scale.setScalar(1);
  }

  #removeBody(item) {
    if (item.body) {
      this.world.removeRigidBody(item.body);
      item.body = null;
    }
  }

  #syncPile() {
    for (const it of this.items) {
      if (it.state !== 'pile' || !it.body) continue;
      const t = it.body.translation();
      // Recover anything that escaped the bowl
      if (t.y < -3 || Math.hypot(t.x, t.z) > BOWL.rimRadius + 1.5) {
        const p = new THREE.Vector3((Math.random() - 0.5) * 2, 6, (Math.random() - 0.5) * 2);
        it.body.setTranslation(p, true);
        it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        continue;
      }
      const r = it.body.rotation();
      it.obj.object3d.position.set(t.x, t.y, t.z);
      it.obj.object3d.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  // ---------------------------------------------------------------- input

  #onPointerDown(e) {
    if (this.state !== 'playing') return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = [this.bowl];
    for (const it of this.items) if (it.state === 'pile') targets.push(it.obj.object3d);
    // The first hit is the object closest to the camera, i.e. the topmost
    // visible one. If the bowl wall is in front, nothing is picked.
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (!hit) return;
    let o = hit.object;
    while (o && !o.userData.item) o = o.parent;
    if (o) this.#pick(o.userData.item);
  }

  #pick(item) {
    const slotIndex = this.slots.findIndex((s) => !s.item);
    if (slotIndex === -1 || this.resolving) return;
    const slot = this.slots[slotIndex];
    slot.item = item;
    item.state = 'flying';
    this.#removeBody(item);

    const o = item.obj.object3d;
    const fromPos = o.position.clone();
    const fromQuat = o.quaternion.clone();
    const toQuat = displayQuat(this.camera);
    this.tweens
      .add(0.32, (k) => {
        o.position.lerpVectors(fromPos, slot.pos, k);
        o.quaternion.slerpQuaternions(fromQuat, toQuat, k);
        o.scale.setScalar(1 + (slot.scale - 1) * k);
      })
      .then(() => {
        if (slot.item !== item || item.state !== 'flying') return;
        item.state = 'slot';
        this.#checkSlots();
      });
  }

  async #checkSlots() {
    const [a, b] = this.slots.map((s) => s.item);
    if (!a || !b || a.state !== 'slot' || b.state !== 'slot' || this.resolving) return;
    this.resolving = true;
    await this.tweens.wait(0.12);
    if (this.slots[0].item !== a || this.slots[1].item !== b) return; // level was cleared

    if (a.typeId === b.typeId) {
      await Promise.all([this.#pop(a), this.#pop(b)]);
      this.slots[0].item = this.slots[1].item = null;
      this.resolving = false;
      this.events.onMatch();
      if (this.hint && this.hint.items.some((i) => i === a || i === b)) this.#clearHint();
      if (this.items.every((i) => i.state === 'gone') && this.state === 'playing') {
        this.state = 'won';
        this.events.onWin({ timeLeft: this.timeLeft });
      }
    } else {
      this.events.onMismatch();
      this.slots[1].item = null;
      this.resolving = false;
      this.#throwBack(b);
    }
  }

  #pop(item) {
    item.state = 'popping';
    const o = item.obj.object3d;
    const s0 = o.scale.x;
    return this.tweens
      .add(
        0.1,
        (k) => o.scale.setScalar(s0 * (1 + 0.25 * k)),
        ease.outCubic,
      )
      .then(() => {
        const color = firstColor(o);
        this.particles.burst(o.position, color, 36, 3.2);
        return this.tweens.add(0.12, (k) => o.scale.setScalar(s0 * 1.25 * (1 - k)), ease.inBack);
      })
      .then(() => {
        item.state = 'gone';
        this.scene.remove(o);
      });
  }

  #throwBack(item) {
    item.state = 'returning';
    const o = item.obj.object3d;
    const from = o.position.clone();
    const s0 = o.scale.x;
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * SPAWN_RADIUS * 0.8;
    const to = new THREE.Vector3(Math.cos(angle) * r, BOWL.rimHeight + 3.5, Math.sin(angle) * r);
    const mid = from.clone().lerp(to, 0.5).setY(Math.max(from.y, to.y) + 2);
    const q0 = o.quaternion.clone();
    const q1 = randomQuat();
    const tmp = new THREE.Vector3();
    this.tweens
      .add(
        0.45,
        (k) => {
          // quadratic bezier arc from the slot back over the bowl
          tmp.copy(from).multiplyScalar((1 - k) * (1 - k));
          tmp.addScaledVector(mid, 2 * (1 - k) * k).addScaledVector(to, k * k);
          o.position.copy(tmp);
          o.quaternion.slerpQuaternions(q0, q1, k);
          o.scale.setScalar(s0 + (1 - s0) * k);
        },
        ease.inOutCubic,
      )
      .then(() => {
        if (item.state !== 'returning') return;
        this.#createBody(item, to, q1, { x: 0, y: -6, z: 0 });
        item.state = 'pile';
      });
  }

  // ---------------------------------------------------------------- power-ups

  /** Highlights one matching pair. Returns false if no pair could be found. */
  useHint() {
    if (this.state !== 'playing') return false;
    const pile = this.items.filter((i) => i.state === 'pile');
    let pair = null;
    const held = this.slots[0].item;
    if (held && !this.slots[1].item && (held.state === 'slot' || held.state === 'flying')) {
      const partner = pile.find((i) => i.typeId === held.typeId);
      if (partner) pair = [held, partner];
    }
    if (!pair) {
      const seen = new Map();
      for (const it of shuffleInPlace(pile.slice())) {
        if (seen.has(it.typeId)) {
          pair = [seen.get(it.typeId), it];
          break;
        }
        seen.set(it.typeId, it);
      }
    }
    if (!pair) return false;
    this.#clearHint();
    this.hint = { items: pair, left: HINT_SECONDS };
    return true;
  }

  #clearHint() {
    if (!this.hint) return;
    this.hint.items.forEach((i) => i.obj.setHighlight(0));
    this.hint = null;
  }

  /** Re-drops every object still in the pile. */
  useShuffle() {
    if (this.state !== 'playing') return false;
    const pile = this.items.filter((i) => i.state === 'pile' && i.body);
    if (!pile.length) return false;
    const spawns = this.#spawnPoints(pile.length).map((p) => p.add(new THREE.Vector3(0, 1.5, 0)));
    shuffleInPlace(pile).forEach((it, i) => {
      const q = randomQuat();
      it.body.setTranslation(spawns[i], true);
      it.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      it.body.setLinvel({ x: 0, y: -2, z: 0 }, true);
      it.body.setAngvel(
        { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 },
        true,
      );
    });
    return true;
  }

  /** Pauses the timer for 10 seconds. */
  useFreeze() {
    if (this.state !== 'playing' || this.freezeLeft > 0) return false;
    this.freezeLeft = FREEZE_SECONDS;
    this.events.onFreezeChange(true);
    return true;
  }

  // ---------------------------------------------------------------- frame

  #frame() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const running = this.state !== 'paused' && this.state !== 'idle' && this.state !== 'loading';

    if (running) {
      this.elapsed += dt;
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < 3) {
        this.world.step();
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === 3) this.accumulator = 0;
      this.#syncPile();
      this.tweens.tick(dt);
      this.particles.tick(dt);

      // Gentle spin for items waiting in the match box
      for (const s of this.slots) {
        if (s.item?.state === 'slot') s.item.obj.object3d.rotateY(dt * 1.2);
      }

      if (this.hint) {
        this.hint.left -= dt;
        if (this.hint.left <= 0) this.#clearHint();
        else {
          const pulse = 0.55 + 0.45 * Math.sin(this.elapsed * 9);
          this.hint.items.forEach((i) => i.obj.setHighlight(pulse));
        }
      }
    }

    if (this.state === 'playing') {
      if (this.freezeLeft > 0) {
        this.freezeLeft -= dt;
        if (this.freezeLeft <= 0) {
          this.freezeLeft = 0;
          this.events.onFreezeChange(false);
        }
      } else {
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        if (this.timeLeft <= 0) {
          this.state = 'lost';
          this.events.onTime(0);
          this.events.onLose();
        }
      }
      if (this.state === 'playing') this.events.onTime(this.timeLeft);
    }

    this.renderer.render(this.scene, this.camera);
  }
}

// ---------------------------------------------------------------- helpers

function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clampToRadius(x, z, r) {
  const d = Math.hypot(x, z);
  if (d <= r) return [x, z];
  return [(x / d) * r, (z / d) * r];
}

function randomQuat() {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2),
  );
}

/** A pleasing presentation rotation: facing the camera, slightly tilted. */
function displayQuat(camera) {
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0.5, 0));
  return camera.quaternion.clone().multiply(tilt);
}

function firstColor(o) {
  let c = '#ffffff';
  o.traverse((m) => {
    if (c === '#ffffff' && m.isMesh) {
      const mat = [].concat(m.material)[0];
      if (mat?.color) c = '#' + mat.color.getHexString();
    }
  });
  return c;
}
