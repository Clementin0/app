import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  OctahedronGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
} from 'three';
import { withRim } from './shading.js';
import { pyramidTexture, signTexture, windowsTexture } from './textures3d.js';

/**
 * Zone scenery beside the track. Each zone has its own set of instanced
 * props (one draw call per part) that scroll with the road and are
 * re-rolled when they wrap around, so the landscape never repeats exactly.
 */

export const SPAN = [-30, 320]; // z range covered by props

/**
 * A layer of instanced props. Each item is drawn with one or more parts
 * (e.g. a volcano and its glowing crater), each an InstancedMesh.
 */
export class PropLayer {
  constructor(scene, { parts, capacity, place, spin = 0, parallax = 1 }) {
    this.capacity = capacity;
    this.place = place;
    this.spin = spin;
    this.parallax = parallax;
    this.dummy = new Object3D();
    this.parts = parts.map((p) => {
      const mesh = new InstancedMesh(p.geometry, p.material, capacity);
      mesh.frustumCulled = false;
      scene.add(mesh);
      return { ...p, mesh };
    });
    this.items = Array.from({ length: capacity }, () => {
      const item = place();
      item.z = SPAN[0] + Math.random() * (SPAN[1] - SPAN[0]);
      return item;
    });
    this.setCount(capacity);
    this.write();
  }

  setCount(n) {
    this.count = Math.max(0, Math.min(this.capacity, Math.round(n)));
    for (const p of this.parts) p.mesh.count = this.count;
  }

  setVisible(v) {
    for (const p of this.parts) p.mesh.visible = v;
  }

  get visible() {
    return this.parts[0].mesh.visible;
  }

  update(dz, dt) {
    const span = SPAN[1] - SPAN[0];
    for (let i = 0; i < this.count; i++) {
      const it = this.items[i];
      it.z -= dz * this.parallax;
      if (this.spin) it.ry += this.spin * dt * (it.spinDir ?? 1);
      if (it.z < SPAN[0]) {
        const fresh = this.place();
        fresh.z = it.z + span;
        this.items[i] = fresh;
      }
    }
    this.write();
  }

  write() {
    const d = this.dummy;
    for (const p of this.parts) {
      for (let i = 0; i < this.count; i++) {
        const it = this.items[i];
        const t = p.transform ? p.transform(it, (p.scratch ??= {})) : it;
        d.position.set(t.x ?? it.x, t.y ?? it.y, t.z ?? it.z);
        d.rotation.set(t.rx ?? it.rx ?? 0, t.ry ?? it.ry ?? 0, t.rz ?? it.rz ?? 0);
        d.scale.set(t.sx ?? it.sx, t.sy ?? it.sy, t.sz ?? it.sz);
        d.updateMatrix();
        p.mesh.setMatrixAt(i, d.matrix);
      }
      p.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(scene) {
    for (const p of this.parts) {
      scene.remove(p.mesh);
      p.mesh.dispose();
    }
  }
}

/** A few holographic signs (sprites) floating beside the road. */
class SignLayer {
  constructor(scene, theme, words) {
    this.sprites = words.map((word, i) => {
      const color = theme.window[i % theme.window.length];
      const s = new Sprite(new SpriteMaterial({ map: signTexture(word, color), transparent: true, depthWrite: false }));
      s.scale.set(9, 4.5, 1);
      this._place(s, SPAN[0] + Math.random() * (SPAN[1] - SPAN[0]));
      scene.add(s);
      return s;
    });
  }

  _place(s, z) {
    const side = Math.random() < 0.5 ? -1 : 1;
    s.position.set(side * (9 + Math.random() * 10), 7 + Math.random() * 8, z);
  }

  setVisible(v) {
    for (const s of this.sprites) s.visible = v;
  }

  setCount() {}

  update(dz) {
    const span = SPAN[1] - SPAN[0];
    for (const s of this.sprites) {
      s.position.z -= dz;
      if (s.position.z < SPAN[0]) this._place(s, s.position.z + span);
    }
  }
}

const R = Math.random;
const side = () => (R() < 0.5 ? -1 : 1);
// Scenery gets a softer neon rim (silhouettes against the sky).
const lambert = (color, emissive = 0x000000, emissiveIntensity = 1, extra = {}) => withRim(new MeshLambertMaterial({ color, emissive, emissiveIntensity, ...extra }), 0.55);

/**
 * Fills a part's scratch transform (reused every frame: no allocations).
 * Unset rotations fall back to the item's own.
 */
function set(o, y, sx, sy, sz, rx, rz) {
  o.y = y;
  o.sx = sx;
  o.sy = sy;
  o.sz = sz;
  if (rx !== undefined) o.rx = rx;
  if (rz !== undefined) o.rz = rz;
  return o;
}

/** Builds the prop layers of a zone theme. `road` = half width of the road. */
export function buildScenery(scene, theme, road, detail = 1) {
  const n = (c) => Math.max(2, Math.round(c * detail));
  const off = (min, range) => side() * (road + min + R() * range);
  switch (theme.id) {
    case 'desert': {
      const pyr = pyramidTexture(theme.building, theme.line);
      return [
        new PropLayer(scene, {
          capacity: n(14),
          place: () => {
            const b = 9 + R() * 16;
            // Placed by their inner edge, so no prop ever reaches the road.
            return { x: off(6 + b * 0.71, 50), y: (b * 0.75) / 2, sx: b, sy: b * 0.75, sz: b, ry: Math.PI / 4 };
          },
          parts: [
            { geometry: new ConeGeometry(0.71, 1, 4, 1), material: lambert(0xffffff, 0xffffff, 0.55, { map: pyr, emissiveMap: pyr }) },
            // Glowing capstone (bloom).
            { geometry: new OctahedronGeometry(0.5, 0), material: new MeshBasicMaterial({ color: theme.line }), transform: (it, o) => set(o, it.sy * 1.02, it.sx * 0.06, it.sx * 0.08, it.sx * 0.06) },
          ],
        }),
        new PropLayer(scene, {
          capacity: n(18),
          place: () => {
            const sx = 10 + R() * 22;
            const sz = 7 + R() * 16;
            return { x: off(4 + Math.max(sx, sz), 40), y: -0.2, sx, sy: 1.5 + R() * 4, sz, ry: R() * Math.PI };
          },
          parts: [{ geometry: new SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), material: lambert(theme.building, theme.side, 0.6) }],
        }),
      ];
    }
    case 'ice':
      return [
        new PropLayer(scene, {
          capacity: n(30),
          place: () => {
            const h = 5 + R() * 14;
            return { x: off(7, 40), y: h * 0.45, sx: 1.2 + R() * 2.4, sy: h, sz: 1.2 + R() * 2.4, rz: (R() - 0.5) * 0.5, ry: R() * Math.PI };
          },
          parts: [{ geometry: new OctahedronGeometry(1, 0), material: lambert(0xbff4ff, 0x2aa8d8, 0.55, { flatShading: true }) }],
        }),
        new PropLayer(scene, {
          capacity: n(12),
          place: () => {
            const sx = 6 + R() * 10;
            const sz = 6 + R() * 9;
            return { x: off(5 + Math.max(sx, sz), 40), y: 0.5, sx, sy: 2 + R() * 4, sz, ry: R() * Math.PI };
          },
          parts: [{ geometry: new DodecahedronGeometry(1, 0), material: lambert(0xe6fbff, 0x6ad8ff, 0.35, { flatShading: true }) }],
        }),
      ];
    case 'inferno':
      return [
        new PropLayer(scene, {
          capacity: n(16),
          place: () => {
            const s = 10 + R() * 14;
            const h = 7 + R() * 12;
            return { x: off(6 + s, 45), y: h / 2, sx: s, sy: h, sz: s };
          },
          parts: [
            { geometry: new CylinderGeometry(0.22, 1, 1, 10, 1), material: lambert(0x2a0b06, 0x3a0500, 0.8, { flatShading: true }) },
            // Molten crater (bloom).
            { geometry: new SphereGeometry(1, 12, 6), material: new MeshBasicMaterial({ color: 0xff6a00 }), transform: (it, o) => set(o, it.sy, it.sx * 0.2, it.sx * 0.06, it.sx * 0.2) },
          ],
        }),
        new PropLayer(scene, {
          capacity: n(20),
          place: () => ({ x: off(5, 30), y: 0.3, sx: 1.5 + R() * 3, sy: 1 + R() * 2.5, sz: 1.5 + R() * 3, ry: R() * Math.PI }),
          parts: [{ geometry: new DodecahedronGeometry(1, 0), material: lambert(0x1a0605, 0xff3d00, 0.25, { flatShading: true }) }],
        }),
      ];
    case 'abyss':
      return [
        new PropLayer(scene, {
          capacity: n(24),
          place: () => {
            const h = 7 + R() * 18;
            return { x: off(6, 38), y: h / 2, sx: 0.5 + R() * 0.6, sy: h, sz: 0.5 + R() * 0.6, rz: (R() - 0.5) * 0.25 };
          },
          parts: [
            { geometry: new CylinderGeometry(0.6, 1, 1, 8, 1), material: lambert(0x0b4a4a, 0x0e8f7a, 0.5) },
            // Bioluminescent rings (bloom).
            ...[0.35, 0.7].map((f) => ({
              geometry: new TorusGeometry(1, 0.18, 6, 16),
              material: new MeshBasicMaterial({ color: f < 0.5 ? theme.line : 0xff5ad9 }),
              transform: (it, o) => set(o, it.sy * f, it.sx * 2.2, it.sx * 2.2, it.sx * 2.2, Math.PI / 2, 0),
            })),
          ],
        }),
        new PropLayer(scene, {
          capacity: n(14),
          place: () => {
            const sx = 3 + R() * 6;
            return { x: off(4 + sx, 40), y: -0.3, sx, sy: 2 + R() * 4, sz: 3 + R() * 6 };
          },
          parts: [{ geometry: new SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), material: lambert(0x5a1050, 0xff2bd6, 0.35) }],
        }),
      ];
    case 'orbit':
      return [
        new PropLayer(scene, {
          capacity: n(28),
          spin: 0.4,
          place: () => {
            const s = 1.2 + R() * 4.8;
            return { x: off(10 + s, 60), y: 3 + R() * 30, sx: s, sy: s * (0.7 + R() * 0.5), sz: s, rx: R() * 3, ry: R() * 3, spinDir: R() < 0.5 ? -1 : 1 };
          },
          parts: [{ geometry: new IcosahedronGeometry(1, 0), material: lambert(0x4a4660, 0x6a2bd6, 0.25, { flatShading: true }) }],
        }),
        new PropLayer(scene, {
          capacity: n(10),
          place: () => {
            const h = 10 + R() * 20;
            return { x: off(5, 12), y: h / 2, sx: 0.5, sy: h, sz: 0.5 };
          },
          parts: [
            { geometry: new BoxGeometry(1, 1, 1), material: lambert(0x2a2448, 0x140a33, 1) },
            { geometry: new BoxGeometry(1, 1, 1), material: new MeshBasicMaterial({ color: theme.line }), transform: (it, o) => set(o, it.sy, 1.4, 0.4, 1.4) },
          ],
        }),
      ];
    default: {
      // City: towers with lit windows and a beacon on the roof, plus signs.
      const win = windowsTexture(theme.window);
      return [
        new PropLayer(scene, {
          capacity: n(64),
          place: () => {
            const h = 6 + R() * 32;
            return { x: off(9, 26), y: h / 2, sx: 3 + R() * 5, sy: h, sz: 3 + R() * 6, beacon: R() < 0.4 };
          },
          parts: [
            { geometry: new BoxGeometry(1, 1, 1), material: lambert(theme.building, 0xffffff, 0.55, { map: win, emissiveMap: win }) },
            {
              geometry: new BoxGeometry(1, 1, 1),
              material: new MeshBasicMaterial({ color: theme.window[1] ?? theme.line }),
              // Roof beacon on some towers (hidden by a zero scale on the others).
              transform: (it, o) => set(o, it.sy + 0.4, it.beacon ? 0.5 : 0, it.beacon ? 0.8 : 0, it.beacon ? 0.5 : 0),
            },
          ],
        }),
        new SignLayer(scene, theme, ['NEON', 'DASH', '2084', 'HOTEL', 'ARCADE', 'BAR']),
      ];
    }
  }
}
