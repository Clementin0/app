import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
} from 'three';
import { dotTexture } from './textures3d.js';

/**
 * Small visual systems of the game view, most of them a single draw call:
 * blob shadows under everything, the runner's light ribbon, explosion
 * debris and flashes, the warp tunnel between zones, the runner's
 * afterimages and the gate at the distance record.
 */

/** Soft dark ellipses on the road under the runner and the entities. */
export class BlobShadows {
  constructor(scene, max = 64) {
    const geo = new PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.material = new MeshBasicMaterial({ color: 0x000000, map: dotTexture(), transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new InstancedMesh(geo, this.material, max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.max = max;
    this.n = 0;
    this.dummy = new Object3D();
    scene.add(this.mesh);
  }

  begin() {
    this.n = 0;
  }

  /** width/depth in meters; `lift` (height above the road) shrinks it. */
  add(x, z, width, depth, lift = 0) {
    if (this.n >= this.max) return;
    const k = Math.max(0.25, 1 - lift / 6);
    const d = this.dummy;
    d.position.set(x, 0.035, z);
    d.scale.set(width * 1.5 * k, 1, depth * 1.4 * k);
    d.updateMatrix();
    this.mesh.setMatrixAt(this.n++, d.matrix);
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * A ribbon of light streaming behind the runner along the road (light-cycle
 * style, flat so the chase camera sees it): the points scroll away with the
 * road, taper and fade out.
 */
export class Ribbon {
  constructor(scene, color, points = 26) {
    this.points = [];
    this.max = points;
    const verts = points * 2;
    this.positions = new Float32Array(verts * 3);
    this.colors = new Float32Array(verts * 3);
    const index = [];
    for (let i = 0; i < points - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3).setUsage(DynamicDrawUsage));
    this.geometry.setIndex(index);
    this.material = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: 2 });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.color = new Color(color);
    scene.add(this.mesh);
  }

  setVisible(v) {
    this.mesh.visible = v;
    if (!v) this.points.length = 0;
  }

  /** x, y: the runner's feet; scroll: meters the road moved this frame. */
  update(x, y, scroll) {
    for (const p of this.points) p.z -= scroll;
    this.points.unshift({ x, y, z: -0.35 });
    if (this.points.length > this.max) this.points.length = this.max;
    const n = this.points.length;
    const c = this.color;
    for (let i = 0; i < this.max; i++) {
      const p = this.points[Math.min(i, n - 1)] ?? { x, y, z: -0.35 };
      const u = i / this.max;
      const fade = i < n ? Math.pow(1 - u, 2) * 0.55 : 0;
      const half = 0.22 * (1 - u * 0.85);
      const k = i * 6;
      this.positions[k] = p.x - half;
      this.positions[k + 1] = p.y + 0.06;
      this.positions[k + 2] = p.z;
      this.positions[k + 3] = p.x + half;
      this.positions[k + 4] = p.y + 0.06;
      this.positions[k + 5] = p.z;
      for (const o of [k, k + 3]) {
        this.colors[o] = c.r * fade;
        this.colors[o + 1] = c.g * fade;
        this.colors[o + 2] = c.b * fade;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** Glowing debris cubes that fly, tumble, bounce on the road and shrink. */
export class Debris {
  constructor(scene, max = 120) {
    this.max = max;
    this.items = [];
    this.material = new MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new InstancedMesh(new BoxGeometry(0.16, 0.16, 0.16), this.material, max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.dummy = new Object3D();
    this.tmp = new Color();
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, this.tmp.setHex(0xffffff));
    scene.add(this.mesh);
  }

  burst(x, y, z, colors, count = 10, speed = 7) {
    for (let i = 0; i < count; i++) {
      if (this.items.length >= this.max) this.items.shift();
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.items.push({
        x,
        y,
        z,
        vx: Math.cos(a) * s,
        vy: 2 + Math.random() * speed * 0.8,
        vz: Math.sin(a) * s,
        rx: Math.random() * 6,
        ry: Math.random() * 6,
        spin: (Math.random() - 0.5) * 18,
        life: 0.8 + Math.random() * 0.5,
        max: 1.3,
        color: colors[(Math.random() * colors.length) | 0],
      });
    }
  }

  update(dt, scroll) {
    const d = this.dummy;
    let n = 0;
    for (const it of this.items) {
      it.life -= dt;
      if (it.life <= 0) continue;
      it.vy -= 20 * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.z += it.vz * dt - scroll;
      if (it.y < 0.08) {
        it.y = 0.08;
        it.vy *= -0.4;
        it.vx *= 0.7;
        it.vz *= 0.7;
      }
      it.rx += it.spin * dt;
      it.ry += it.spin * 0.7 * dt;
      d.position.set(it.x, it.y, it.z);
      d.rotation.set(it.rx, it.ry, 0);
      d.scale.setScalar(Math.min(1, it.life / 0.4) * 1.2);
      d.updateMatrix();
      this.mesh.setMatrixAt(n, d.matrix);
      this.mesh.setColorAt(n, this.tmp.setHex(it.color));
      n += 1;
    }
    this.items = this.items.filter((it) => it.life > 0);
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/** Bright flash at the heart of an explosion: swells fast, fades out. */
export class Flashes {
  constructor(scene, count = 8) {
    this.sprites = Array.from({ length: count }, () => {
      const s = new Sprite(new SpriteMaterial({ map: dotTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending }));
      s.visible = false;
      s.userData = { t: 1, size: 1 };
      scene.add(s);
      return s;
    });
    this.next = 0;
  }

  spawn(x, y, z, color = 0xfff1c2, size = 4) {
    const s = this.sprites[this.next];
    this.next = (this.next + 1) % this.sprites.length;
    s.position.set(x, y, z);
    s.material.color.setHex(color);
    s.userData.t = 0;
    s.userData.size = size;
    s.visible = true;
  }

  update(dt, scroll) {
    for (const s of this.sprites) {
      if (!s.visible) continue;
      const u = s.userData;
      u.t += dt / 0.28;
      if (u.t >= 1) {
        s.visible = false;
        continue;
      }
      const grow = u.t < 0.25 ? u.t / 0.25 : 1;
      s.scale.setScalar(u.size * (0.4 + grow * 0.8));
      s.material.opacity = u.t < 0.25 ? 1 : 1 - (u.t - 0.25) / 0.75;
      s.position.z -= scroll;
    }
  }

  dispose() {
    for (const s of this.sprites) {
      s.removeFromParent();
      s.material.dispose();
    }
  }
}

/**
 * Warp between two zones: rings of light rush past the camera while the
 * world changes behind them. k (0..1..0) also drives the camera and grading.
 */
export class WarpTunnel {
  constructor(scene, count = 16) {
    this.count = count;
    this.material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false });
    this.mesh = new InstancedMesh(new TorusGeometry(6.2, 0.1, 6, 56), this.material, count);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.dummy = new Object3D();
    this.zs = new Float32Array(count);
    this.t = 1;
    this.duration = 1.9;
    scene.add(this.mesh);
  }

  /** Strength of the warp right now: rises and falls once. */
  get k() {
    return this.t < 1 ? Math.sin(Math.PI * this.t) : 0;
  }

  start(color) {
    this.material.color.setHex(color);
    for (let i = 0; i < this.count; i++) this.zs[i] = 6 + i * 9;
    this.t = 0;
    this.mesh.visible = true;
  }

  update(dt) {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / this.duration);
    const k = this.k;
    const span = this.count * 9;
    const d = this.dummy;
    for (let i = 0; i < this.count; i++) {
      let z = this.zs[i] - (80 + 220 * k) * dt;
      if (z < -8) z += span;
      this.zs[i] = z;
      d.position.set(0, 2.4, z);
      d.rotation.set(0, 0, z * 0.04 + i * 0.3);
      d.scale.set(1, 0.72, 1);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.material.opacity = k * 0.85;
    if (this.t >= 1) this.mesh.visible = false;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * Glowing copies of the runner trailing behind it (turbo, overdrive,
 * jetpack). Built on first use; each copy replays a pose from a moment ago.
 */
export class Afterimages {
  constructor(parent, build, color, count = 3) {
    this.parent = parent;
    this.build = build;
    this.color = color;
    this.count = count;
    this.copies = null;
    this.history = [];
    this.clock = 0;
    this.k = 0;
  }

  _create() {
    this.copies = Array.from({ length: this.count }, () => {
      const material = new MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
      const copy = this.build();
      copy.traverse((o) => {
        if (o.isSprite) {
          // Glows and flames stay off: the copy is one flat color.
          o.material.dispose();
          o.visible = false;
        } else if (o.isMesh) {
          o.material.dispose?.();
          o.material = material;
        }
      });
      for (const k of ['muzzle', 'jetpack']) if (copy.userData[k]) copy.userData[k].visible = false;
      copy.visible = false;
      this.parent.add(copy);
      return { copy, material };
    });
  }

  /** pose: { x, y, time, grounded, sliding, vy, lean }; active: should they show. */
  update(dt, pose, active, animate) {
    this.k += ((active ? 1 : 0) - this.k) * Math.min(1, dt * 6);
    this.clock += dt;
    if (this.clock >= 0.035) {
      this.clock = 0;
      this.history.unshift({ ...pose });
      if (this.history.length > this.count * 3 + 1) this.history.length = this.count * 3 + 1;
    }
    if (this.k < 0.02) {
      if (this.copies) for (const c of this.copies) c.copy.visible = false;
      return;
    }
    if (!this.copies) this._create();
    this.copies.forEach(({ copy, material }, i) => {
      const h = this.history[Math.min(this.history.length - 1, (i + 1) * 3)];
      if (!h) return;
      copy.visible = true;
      copy.position.set(h.x, h.y, -(i + 1) * 0.85);
      copy.scale.setScalar(pose.scale ?? 1);
      animate(copy, h);
      material.opacity = 0.34 * (1 - i / this.count) * this.k;
    });
  }

  dispose() {
    if (!this.copies) return;
    for (const { copy, material } of this.copies) {
      copy.removeFromParent();
      material.dispose();
    }
  }
}

function recordSignTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ffd23f';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#fff6c8';
  ctx.fillText(text, 256, 66);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 16;
  const ctx = c.getContext('2d');
  for (let x = 0; x < 8; x++)
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#ffd23f' : '#1a0d00';
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = NearestFilter;
  tex.wrapS = RepeatWrapping;
  return tex;
}

/** A golden gate across the road at the distance record, with a checkered line. */
export class RecordGate {
  constructor(parent, label, halfWidth = 4.2) {
    this.group = new Group();
    this.gold = new MeshBasicMaterial({ color: 0xffc83d });
    const w = halfWidth + 0.7;
    const post = new BoxGeometry(0.3, 7.4, 0.3);
    for (const s of [-1, 1]) {
      const m = new Mesh(post, this.gold);
      m.position.set(s * w, 3.7, 0);
      this.group.add(m);
    }
    const bar = new Mesh(new BoxGeometry(w * 2 + 0.3, 0.32, 0.32), this.gold);
    bar.position.y = 7.4;
    this.group.add(bar);
    this.lineMat = new MeshBasicMaterial({ map: checkerTexture(), transparent: true, opacity: 0.9, depthWrite: false });
    this.lineMat.map.repeat.set(4, 1);
    const line = new Mesh(new PlaneGeometry(halfWidth * 2, 1.1), this.lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.05;
    this.group.add(line);
    this.signMat = new SpriteMaterial({ map: recordSignTexture(label), transparent: true, depthWrite: false });
    this.sign = new Sprite(this.signMat);
    this.sign.scale.set(11, 2.75, 1);
    this.sign.position.y = 8.9;
    this.group.add(this.sign);
    this.group.visible = false;
    parent.add(this.group);
    this.time = 0;
  }

  /** z: meters from the runner to the record (negative once passed). */
  update(dt, z) {
    this.time += dt;
    this.group.visible = z > -6 && z < 170;
    if (!this.group.visible) return;
    this.group.position.z = z;
    this.sign.position.y = 8.9 + Math.sin(this.time * 2.4) * 0.15;
    this.gold.color.setHSL(0.12, 1, 0.55 + 0.1 * Math.sin(this.time * 5));
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => o.geometry?.dispose());
    for (const m of [this.gold, this.lineMat, this.signMat]) {
      m.map?.dispose();
      m.dispose();
    }
  }
}
