import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, PointsMaterial } from 'three';
import { dotTexture } from './textures3d.js';

/**
 * Pool of additive point particles (explosions, sparks, trail, coins).
 * Positions are updated on the CPU; one draw call for everything.
 */
export class Particles {
  constructor(scene, max = 500) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.base = new Float32Array(max * 3);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.col, 3));
    this.geometry.setDrawRange(0, 0);
    this.material = new PointsMaterial({
      size: 0.45,
      map: dotTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.tmp = new Color();
  }

  /** Spawns n particles at (x, y, z) with random velocity of magnitude `speed`. */
  burst(x, y, z, colors, n = 20, speed = 6, life = 0.7, { up = 0, drift = 0 } = {}) {
    for (let k = 0; k < n; k++) {
      if (this.count >= this.max) return;
      const i = this.count++;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.4 + Math.random() * 0.6);
      const k3 = i * 3;
      this.pos[k3] = x;
      this.pos[k3 + 1] = y;
      this.pos[k3 + 2] = z;
      this.vel[k3] = Math.sin(phi) * Math.cos(theta) * s;
      this.vel[k3 + 1] = Math.cos(phi) * s + up;
      this.vel[k3 + 2] = Math.sin(phi) * Math.sin(theta) * s + drift;
      const c = this.tmp.setHex(colors[(Math.random() * colors.length) | 0]);
      this.base[k3] = this.col[k3] = c.r;
      this.base[k3 + 1] = this.col[k3 + 1] = c.g;
      this.base[k3 + 2] = this.col[k3 + 2] = c.b;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.4);
    }
  }

  update(dt, scroll = 0) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // Swap with the last live particle.
        const last = --this.count;
        if (i !== last) {
          for (let a = 0; a < 3; a++) {
            this.pos[i * 3 + a] = this.pos[last * 3 + a];
            this.vel[i * 3 + a] = this.vel[last * 3 + a];
            this.base[i * 3 + a] = this.base[last * 3 + a];
          }
          this.life[i] = this.life[last];
          this.maxLife[i] = this.maxLife[last];
        }
        continue;
      }
      const k = i * 3;
      this.vel[k + 1] -= 9 * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += (this.vel[k + 2] - scroll) * dt;
      const f = this.life[i] / this.maxLife[i];
      this.col[k] = this.base[k] * f;
      this.col[k + 1] = this.base[k + 1] * f;
      this.col[k + 2] = this.base[k + 2] * f;
      i++;
    }
    this.geometry.setDrawRange(0, this.count);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  clear() {
    this.count = 0;
    this.geometry.setDrawRange(0, 0);
  }

  dispose() {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
