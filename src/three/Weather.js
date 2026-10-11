import { AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, InstancedMesh, MeshBasicMaterial, NormalBlending, Object3D, Points, PointsMaterial } from 'three';
import { dotTexture, streakTexture } from './textures3d.js';

/**
 * Zone weather: one Points cloud around the track (rain, sand, snow,
 * embers, bubbles, stardust) that drifts and scrolls with the road.
 */
export const WEATHER_TYPES = Object.freeze({
  rain: { color: 0x9fe8ff, size: 1.1, streak: true, vel: [0, -26, 0], opacity: 0.45, sway: 0 },
  sand: { color: 0xffb36b, size: 0.28, vel: [8, -0.8, 0], opacity: 0.75, sway: 1.2 },
  snow: { color: 0xffffff, size: 0.36, vel: [0.6, -2.4, 0], opacity: 0.9, sway: 1.4 },
  embers: { color: 0xff7a1a, size: 0.32, vel: [0, 2.8, 0], opacity: 0.95, sway: 0.9, additive: true },
  bubbles: { color: 0x9ff6ff, size: 0.4, vel: [0, 2.3, 0], opacity: 0.6, sway: 0.7, additive: true },
  stardust: { color: 0xffffff, size: 0.45, vel: [0, 0, -18], opacity: 0.85, sway: 0, additive: true },
});

const BOX = { x: 24, y0: 0, y1: 18, z0: -6, z1: 70 };

export class Weather {
  constructor(scene, max = 420) {
    this.max = max;
    this.count = max;
    this.pos = new Float32Array(max * 3);
    this.phase = new Float32Array(max);
    for (let i = 0; i < max; i++) {
      this.pos[i * 3] = (Math.random() * 2 - 1) * BOX.x;
      this.pos[i * 3 + 1] = BOX.y0 + Math.random() * (BOX.y1 - BOX.y0);
      this.pos[i * 3 + 2] = BOX.z0 + Math.random() * (BOX.z1 - BOX.z0);
      this.phase[i] = Math.random() * Math.PI * 2;
    }
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.material = new PointsMaterial({ size: 0.4, map: dotTexture(), transparent: true, depthWrite: false, sizeAttenuation: true });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.time = 0;
    this.intensity = 1; // > 1 during a storm
    this.setType('rain');
  }

  setType(type) {
    const t = WEATHER_TYPES[type] ?? WEATHER_TYPES.rain;
    this.type = t;
    const m = this.material;
    m.color.setHex(t.color);
    m.size = t.size;
    m.opacity = t.opacity;
    m.map = t.streak ? streakTexture() : dotTexture();
    m.blending = t.additive ? AdditiveBlending : NormalBlending;
    m.needsUpdate = true;
  }

  setCount(n) {
    this.count = Math.max(0, Math.min(this.max, Math.round(n)));
    this.geometry.setDrawRange(0, Math.min(this.max, Math.round(this.count * this.intensity)));
  }

  setIntensity(k) {
    this.intensity = Math.max(1, k);
    this.setCount(this.count);
  }

  update(dt, speed) {
    this.time += dt;
    const t = this.type;
    const n = Math.min(this.max, Math.round(this.count * this.intensity));
    const [vx, vy, vz] = t.vel;
    const storm = this.intensity;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      let x = this.pos[k] + (vx * storm + (t.sway ? Math.sin(this.time * 1.7 + this.phase[i]) * t.sway : 0)) * dt;
      let y = this.pos[k + 1] + vy * dt;
      let z = this.pos[k + 2] + (vz - speed) * dt;
      if (y < BOX.y0) y += BOX.y1 - BOX.y0;
      else if (y > BOX.y1) y -= BOX.y1 - BOX.y0;
      if (z < BOX.z0) z += BOX.z1 - BOX.z0;
      if (x > BOX.x) x -= BOX.x * 2;
      else if (x < -BOX.x) x += BOX.x * 2;
      this.pos[k] = x;
      this.pos[k + 1] = y;
      this.pos[k + 2] = z;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }

  setVisible(v) {
    this.points.visible = v;
  }
}

/**
 * Speed lines: thin glowing streaks rushing past the camera, faded in by
 * `strength` (0..1, from speed or a turbo boost).
 */
export class SpeedLines {
  constructor(scene, count = 36) {
    this.count = count;
    this.material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    this.mesh = new InstancedMesh(new BoxGeometry(0.035, 0.035, 4), this.material, count);
    this.mesh.frustumCulled = false;
    this.items = Array.from({ length: count }, () => this._spawn({}, Math.random() * 60));
    this.dummy = new Object3D();
    this.strength = 0;
    scene.add(this.mesh);
  }

  _spawn(it, z = 60) {
    const a = Math.random() * Math.PI * 2;
    const r = 3.5 + Math.random() * 5;
    it.x = Math.cos(a) * r;
    it.y = 2.4 + Math.sin(a) * r * 0.7;
    it.z = z;
    it.len = 2 + Math.random() * 4;
    return it;
  }

  update(dt, speed, strength, camX = 0) {
    this.strength += (strength - this.strength) * Math.min(1, dt * 4);
    this.material.opacity = 0.55 * this.strength;
    this.mesh.visible = this.strength > 0.02;
    if (!this.mesh.visible) return;
    const d = this.dummy;
    for (let i = 0; i < this.count; i++) {
      const it = this.items[i];
      it.z -= (speed * 2.2 + 20) * dt;
      if (it.z < -8) this._spawn(it);
      d.position.set(it.x + camX, it.y, it.z);
      d.scale.set(1, 1, it.len * (0.5 + this.strength));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
