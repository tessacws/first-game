// Pooled additive point-sprite bursts for the "pop" effect.
import * as THREE from 'three';

const CAPACITY = 600;

function makeSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Particles {
  constructor(scene) {
    this.positions = new Float32Array(CAPACITY * 3);
    this.colors = new Float32Array(CAPACITY * 3);
    this.base = new Float32Array(CAPACITY * 3);
    this.vel = new Float32Array(CAPACITY * 3);
    this.life = new Float32Array(CAPACITY);
    this.maxLife = new Float32Array(CAPACITY).fill(1);
    this.next = 0;
    this.alive = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.positions.fill(9999);
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.22,
        map: makeSprite(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
  }

  burst(position, color, count = 40, speed = 4) {
    const c = new THREE.Color(color);
    const white = new THREE.Color('#ffffff');
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % CAPACITY;
      const dir = new THREE.Vector3().randomDirection();
      const s = speed * (0.4 + Math.random() * 0.8);
      this.positions[i * 3] = position.x;
      this.positions[i * 3 + 1] = position.y;
      this.positions[i * 3 + 2] = position.z;
      this.vel[i * 3] = dir.x * s;
      this.vel[i * 3 + 1] = dir.y * s + 1.5;
      this.vel[i * 3 + 2] = dir.z * s;
      const col = Math.random() < 0.3 ? white : c;
      this.base[i * 3] = col.r;
      this.base[i * 3 + 1] = col.g;
      this.base[i * 3 + 2] = col.b;
      this.life[i] = this.maxLife[i] = 0.5 + Math.random() * 0.5;
    }
    this.alive = CAPACITY;
  }

  tick(dt) {
    if (!this.alive) return;
    let any = 0;
    for (let i = 0; i < CAPACITY; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.positions[i3 + 1] = 9999;
        this.colors[i3] = this.colors[i3 + 1] = this.colors[i3 + 2] = 0;
        continue;
      }
      any++;
      this.vel[i3 + 1] -= 9 * dt;
      this.vel[i3] *= 0.97;
      this.vel[i3 + 2] *= 0.97;
      this.positions[i3] += this.vel[i3] * dt;
      this.positions[i3 + 1] += this.vel[i3 + 1] * dt;
      this.positions[i3 + 2] += this.vel[i3 + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.colors[i3] = this.base[i3] * f;
      this.colors[i3 + 1] = this.base[i3 + 1] * f;
      this.colors[i3 + 2] = this.base[i3 + 2] * f;
    }
    this.alive = any;
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
