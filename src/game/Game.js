// Core game: rendering, physics, the pile, the 2-slot match plate, power-ups.
// UI talks to this class only through its public methods and the `events`
// callbacks passed to the constructor.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { OBJECT_SIZE, createObject, preloadTypes } from '../objects/objects.js';
import {
  TABLE_COLOR,
  createPlateMesh,
  createTableColliders,
  createTableMesh,
  sizeTableMesh,
} from './arena.js';
import { Particles } from './particles.js';
import { Tweens, ease } from './tween.js';

const FIXED_DT = 1 / 60;
const FREEZE_SECONDS = 10;
const HINT_SECONDS = 4;
const SLOT_DISTANCE = 6; // distance from camera at which plate items float
const CAMERA_ELEVATION = THREE.MathUtils.degToRad(80); // ~top-down
const AREA_PER_ITEM = 0.5; // table area (world units²) per object; lower = denser pile
const MIN_AREA = 16;
const TABLE_ASPECT = 1.45; // depth / width (portrait)
const SPAWN_SPACING = OBJECT_SIZE * 1.0;

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
    this.layoutInfo = null;
    this.tableBody = null;

    this.#setupRenderer();
    this.#setupScene();
    this.world = new RAPIER.World({ x: 0, y: -14, z: 0 });
    this.world.timestep = FIXED_DT;
    this.#setTableSize(14);
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
    this.scene.background = new THREE.Color(TABLE_COLOR);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 120);
    this.scene.add(this.camera);

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#5a4a3a', 1.7));
    const sun = new THREE.DirectionalLight('#ffffff', 2.3);
    sun.position.set(4, 16, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.002;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 40;
    this.sun = sun;
    this.scene.add(sun);

    // Lights items on the plate (they sit near the camera)
    const fill = new THREE.PointLight('#ffffff', 22, 14, 2);
    this.camera.add(fill);

    this.table = createTableMesh();
    this.scene.add(this.table);

    this.plate = createPlateMesh();
    this.plate.rotation.x = Math.PI / 2; // dish faces the camera
    this.plate.visible = false;
    this.camera.add(this.plate);
  }

  /** Resizes the play rectangle (and its colliders) for `itemCount` objects. */
  #setTableSize(itemCount) {
    const area = Math.max(MIN_AREA, itemCount * AREA_PER_ITEM);
    this.tableW = Math.sqrt(area / TABLE_ASPECT);
    this.tableD = this.tableW * TABLE_ASPECT;
    if (this.tableBody) this.world.removeRigidBody(this.tableBody);
    this.tableBody = createTableColliders(RAPIER, this.world, this.tableW, this.tableD);
    sizeTableMesh(this.table, this.tableW, this.tableD);

    const s = this.sun.shadow.camera;
    const half = Math.max(this.tableW, this.tableD) / 2 + 1.5;
    s.left = s.bottom = -half;
    s.right = s.top = half;
    s.updateProjectionMatrix();
    if (this.layoutInfo) this.#applyLayout();
  }

  // ---------------------------------------------------------------- layout

  /**
   * @param {number} width   canvas CSS width
   * @param {number} height  canvas CSS height
   * @param {number} top     px covered by the HUD at the top
   * @param {number} bottom  px covered by plate + buttons at the bottom
   * @param {DOMRect} plateRect screen rect of the round match plate
   */
  layout(width, height, top, bottom, plateRect) {
    this.layoutInfo = { width, height, top, bottom, plateRect };
    this.renderer.setSize(width, height, false);
    this.#applyLayout();
  }

  #applyLayout() {
    const { width, height, top, bottom, plateRect } = this.layoutInfo;
    const cam = this.camera;
    cam.aspect = width / height;

    // Fit the table rectangle into the free area between HUD and plate.
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const tanH = tanV * cam.aspect;
    const avail = Math.max(0.3, (height - top - bottom) / height);
    const halfW = this.tableW / 2 + 0.35;
    const halfD = (this.tableD / 2) * Math.sin(CAMERA_ELEVATION) + 1.0 * Math.cos(CAMERA_ELEVATION) + 0.35;
    const dist = Math.max(halfW / tanH, halfD / (tanV * avail)) + 1.0;

    const target = new THREE.Vector3(0, 0.4, 0);
    cam.position.set(0, target.y + dist * Math.sin(CAMERA_ELEVATION), dist * Math.cos(CAMERA_ELEVATION));
    cam.lookAt(target);

    // Center the table in the free area instead of the middle of the screen.
    const centerY = top + (height - top - bottom) / 2;
    cam.setViewOffset(width, height, 0, height / 2 - centerY, width, height);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    if (!plateRect || !plateRect.width) return;

    // Plate + slot anchors: unproject the plate's screen rect into camera space.
    const worldPerPx = (2 * SLOT_DISTANCE * tanV) / height;
    const toCamSpace = (px, py, depth) => {
      const ndc = new THREE.Vector3((px / width) * 2 - 1, -(py / height) * 2 + 1, 0.5).unproject(cam);
      const dir = ndc.sub(cam.position).normalize();
      return cam.position.clone().addScaledVector(dir, depth);
    };
    const cx = plateRect.left + plateRect.width / 2;
    const cy = plateRect.top + plateRect.height / 2;
    const radiusPx = plateRect.width / 2;
    const plateRadius = radiusPx * worldPerPx * 1.08; // plate sits a bit further back
    const plateWorld = toCamSpace(cx, cy, SLOT_DISTANCE * 1.08);
    this.plate.position.copy(cam.worldToLocal(plateWorld));
    this.plate.scale.setScalar(plateRadius);
    this.plate.visible = true;

    this.slots.forEach((slot, i) => {
      const sx = cx + (i === 0 ? -1 : 1) * radiusPx * 0.47;
      slot.pos.copy(toCamSpace(sx, cy, SLOT_DISTANCE));
      slot.scale = (radiusPx * 0.78 * worldPerPx) / OBJECT_SIZE;
      if (slot.item && slot.item.state === 'slot') {
        slot.item.obj.object3d.position.copy(slot.pos);
        slot.item.obj.object3d.scale.setScalar(slot.scale);
      }
    });
  }

  // ---------------------------------------------------------------- level lifecycle

  /** @param {{items: string[], types: string[], time: number}} level */
  async loadLevel(level) {
    const token = ++this.loadToken;
    this.state = 'loading';
    this.#clear();
    await preloadTypes(level.types);
    const created = await Promise.all(level.items.map((id) => createObject(id)));
    if (token !== this.loadToken) {
      // A newer load started while we were waiting; throw these away.
      created.forEach((o) => this.#disposeObject(o.object3d));
      return;
    }
    this.items = created.map((obj, i) => ({
      uid: i,
      typeId: level.items[i],
      obj,
      body: null,
      state: 'pile',
    }));
    for (const it of this.items) it.obj.object3d.userData.item = it;

    this.#setTableSize(this.items.length);
    const spawns = this.#spawnPoints(this.items.length);
    shuffleInPlace(this.items).forEach((it, i) => {
      this.scene.add(it.obj.object3d);
      this.#createBody(it, spawns[i], randomQuat());
    });

    // Let the pile mostly settle before the player sees it.
    for (let i = 0; i < 90; i++) this.world.step();
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
    if (this.state === 'paused') this.state = 'playing';
  }

  /** After losing: continue with extra time (rewarded ad). */
  continueWithTime(seconds) {
    if (this.state !== 'lost') return;
    this.timeLeft = seconds;
    this.state = 'playing';
    this.events.onTime(this.timeLeft);
  }

  /** Removes everything from the table (used when leaving to the menu). */
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

  /** Jittered grid positions over the table, stacked in layers above it. */
  #spawnPoints(count, baseY = 0.8) {
    const halfW = this.tableW / 2 - SPAWN_SPACING / 2;
    const halfD = this.tableD / 2 - SPAWN_SPACING / 2;
    const grid = [];
    for (let x = -halfW; x <= halfW + 1e-6; x += SPAWN_SPACING) {
      for (let z = -halfD; z <= halfD + 1e-6; z += SPAWN_SPACING) grid.push([x, z]);
    }
    const pts = [];
    for (let layer = 0; pts.length < count; layer++) {
      const y = baseY + layer * SPAWN_SPACING;
      for (const [x, z] of shuffleInPlace(grid.slice())) {
        if (pts.length >= count) break;
        const jx = (Math.random() - 0.5) * 0.3;
        const jz = (Math.random() - 0.5) * 0.3;
        pts.push(
          new THREE.Vector3(
            THREE.MathUtils.clamp(x + jx, -halfW, halfW),
            y,
            THREE.MathUtils.clamp(z + jz, -halfD, halfD),
          ),
        );
      }
    }
    return pts;
  }

  #createBody(item, pos, quat, linvel) {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setLinearDamping(0.3)
      .setAngularDamping(0.8)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(desc);
    const cd =
      RAPIER.ColliderDesc.convexHull(item.obj.hullPoints) ?? RAPIER.ColliderDesc.ball(item.obj.radius);
    cd.setFriction(0.8).setRestitution(0.05).setDensity(1);
    this.world.createCollider(cd, body);
    if (linvel) body.setLinvel(linvel, true);
    item.body = body;
    const o = item.obj.object3d;
    setCastShadow(o, true);
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
    const limitX = this.tableW / 2 + 1.5;
    const limitZ = this.tableD / 2 + 1.5;
    for (const it of this.items) {
      if (it.state !== 'pile' || !it.body) continue;
      const t = it.body.translation();
      // Recover anything that escaped the table
      if (t.y < -3 || Math.abs(t.x) > limitX || Math.abs(t.z) > limitZ) {
        const p = this.#spawnPoints(1, 4)[0];
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
    const targets = [];
    for (const it of this.items) if (it.state === 'pile') targets.push(it.obj.object3d);
    // The first hit is the object closest to the camera, i.e. the topmost visible one.
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (!hit) return;
    let o = hit.object;
    while (o && !o.userData.item) o = o.parent;
    if (o) this.#pick(o.userData.item);
  }

  /** Sends a pile item to the first free plate slot. Returns false if none is free. */
  #pick(item) {
    const slotIndex = this.slots.findIndex((s) => !s.item);
    if (slotIndex === -1 || this.resolving || item.state !== 'pile') return false;
    const slot = this.slots[slotIndex];
    slot.item = item;
    item.state = 'flying';
    this.#removeBody(item);

    const o = item.obj.object3d;
    setCastShadow(o, false); // it's near the camera now; its shadow would land on the table
    const fromPos = o.position.clone();
    const fromQuat = o.quaternion.clone();
    const toQuat = displayQuat(this.camera);
    this.tweens
      .add(0.3, (k) => {
        o.position.lerpVectors(fromPos, slot.pos, k);
        o.quaternion.slerpQuaternions(fromQuat, toQuat, k);
        o.scale.setScalar(1 + (slot.scale - 1) * k);
      })
      .then(() => {
        if (slot.item !== item || item.state !== 'flying') return;
        item.state = 'slot';
        this.#checkSlots();
      });
    return true;
  }

  async #checkSlots() {
    const [a, b] = this.slots.map((s) => s.item);
    if (!a || !b || a.state !== 'slot' || b.state !== 'slot' || this.resolving) return;
    this.resolving = true;
    await this.tweens.wait(0.1);
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
      .add(0.1, (k) => o.scale.setScalar(s0 * (1 + 0.25 * k)), ease.outCubic)
      .then(() => {
        this.particles.burst(o.position, item.obj.color, 36, 3.2);
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
    const to = this.#spawnPoints(1, 3)[0];
    const mid = from.clone().lerp(to, 0.5).setY(Math.max(from.y, to.y) + 2);
    const q0 = o.quaternion.clone();
    const q1 = randomQuat();
    const tmp = new THREE.Vector3();
    this.tweens
      .add(
        0.45,
        (k) => {
          // quadratic bezier arc from the plate back over the table
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

  /** A pair that can be matched right now: [heldItem, partner] or two pile items. */
  #findPair() {
    const pile = this.items.filter((i) => i.state === 'pile');
    const held = this.slots[0].item;
    if (held && !this.slots[1].item && (held.state === 'slot' || held.state === 'flying')) {
      const partner = pile.find((i) => i.typeId === held.typeId);
      return partner ? [held, partner] : null;
    }
    if (held) return null;
    const seen = new Map();
    for (const it of shuffleInPlace(pile.slice())) {
      if (seen.has(it.typeId)) return [seen.get(it.typeId), it];
      seen.set(it.typeId, it);
    }
    return null;
  }

  /** Highlights one matching pair. Returns false if no pair could be found. */
  useHint() {
    if (this.state !== 'playing') return false;
    const pair = this.#findPair();
    if (!pair) return false;
    this.#clearHint();
    this.hint = { items: pair, left: HINT_SECONDS };
    return true;
  }

  /** Pulls a matching pair onto the plate automatically. */
  useMagnet() {
    if (this.state !== 'playing' || this.resolving) return false;
    const pair = this.#findPair();
    if (!pair) return false;
    for (const it of pair) if (it.state === 'pile') this.#pick(it);
    return true;
  }

  #clearHint() {
    if (!this.hint) return;
    this.hint.items.forEach((i) => i.obj.setHighlight(0));
    this.hint = null;
  }

  /** Re-drops every object still on the table. */
  useShuffle() {
    if (this.state !== 'playing') return false;
    const pile = this.items.filter((i) => i.state === 'pile' && i.body);
    if (!pile.length) return false;
    const spawns = this.#spawnPoints(pile.length, 2);
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

      // Gentle spin for items waiting on the plate
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

function randomQuat() {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2),
  );
}

function setCastShadow(o, on) {
  o.traverse((m) => {
    if (m.isMesh) m.castShadow = on;
  });
}

/** A pleasing presentation rotation: facing the camera, slightly tilted. */
function displayQuat(camera) {
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0.5, 0));
  return camera.quaternion.clone().multiply(tilt);
}
