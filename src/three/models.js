import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
} from 'three';
import { GAME3D } from '../config/game3d.config.js';
import { crateTexture, dotTexture, hazardTexture, panelTexture, powerupIconTexture } from './textures3d.js';

/**
 * Procedural low-poly models for every entity type. Geometries and
 * materials are shared (created once); each factory returns a fresh
 * Object3D whose origin is at the entity's bottom-center.
 */

const geo = new Map();
const mat = new Map();

const G = (key, make) => {
  if (!geo.has(key)) geo.set(key, make());
  return geo.get(key);
};
const M = (key, make) => {
  if (!mat.has(key)) mat.set(key, make());
  return mat.get(key);
};

export const lambert = (color, emissive = 0x000000, emissiveIntensity = 1) =>
  M(`l_${color}_${emissive}_${emissiveIntensity}`, () => new MeshLambertMaterial({ color, emissive, emissiveIntensity }));
export const basic = (color, opts = {}) => M(`b_${color}_${JSON.stringify(opts)}`, () => new MeshBasicMaterial({ color, ...opts }));
export const glowMat = (color) => M(`g_${color}`, () => new SpriteMaterial({ map: dotTexture(), color, blending: AdditiveBlending, transparent: true, depthWrite: false }));

const box = (w, h, d) => G(`box_${w}_${h}_${d}`, () => new BoxGeometry(w, h, d));

function neonEdges(geometry, color) {
  const edges = G(`edges_${geometry.uuid}`, () => new EdgesGeometry(geometry));
  return new LineSegments(edges, M(`line_${color}`, () => new LineBasicMaterial({ color })));
}

export function glow(color, size) {
  const s = new Sprite(glowMat(color));
  s.scale.set(size, size, size);
  return s;
}

// ------------------------------------------------------------- obstacles

function barrier() {
  const s = GAME3D.OBSTACLES.barrier;
  const g = new Group();
  const body = new Mesh(box(s.w, s.h, s.d), M('hazard', () => new MeshLambertMaterial({ map: hazardTexture(), emissive: 0x332200 })));
  body.position.y = s.h / 2;
  const top = new Mesh(box(s.w, 0.08, s.d + 0.04), basic(0xffd23f));
  top.position.y = s.h;
  g.add(body, top);
  return g;
}

function beam() {
  const s = GAME3D.OBSTACLES.beam;
  const g = new Group();
  const postGeo = box(0.18, s.y + s.h + 0.1, 0.18);
  for (const x of [-s.w / 2, s.w / 2]) {
    const post = new Mesh(postGeo, lambert(0x2a2a40, 0x110022));
    post.position.set(x, (s.y + s.h + 0.1) / 2, 0);
    g.add(post);
  }
  const laser = new Mesh(box(s.w, s.h * 0.55, s.d * 0.5), basic(0xff2244));
  laser.position.y = s.y + s.h / 2;
  const halo = new Mesh(box(s.w, s.h, s.d), basic(0xff3860, { transparent: true, opacity: 0.25, depthWrite: false }));
  halo.position.y = s.y + s.h / 2;
  g.add(laser, halo);
  return g;
}

function wall(theme) {
  const s = GAME3D.OBSTACLES.wall;
  const g = new Group();
  const geometry = box(s.w, s.h, s.d);
  const body = new Mesh(geometry, M(`wall_${theme.line}`, () => new MeshLambertMaterial({ map: panelTexture(theme.line), emissive: 0x0a0418 })));
  body.position.y = s.h / 2;
  const edges = neonEdges(geometry, theme.line);
  edges.position.y = s.h / 2;
  g.add(body, edges);
  return g;
}

function platform(theme, depth) {
  const s = GAME3D.OBSTACLES.platform;
  const g = new Group();
  const body = new Mesh(box(1, 1, 1), M(`plat_${theme.grid}`, () => new MeshLambertMaterial({ map: panelTexture(theme.grid), emissive: 0x0a0418 })));
  body.scale.set(s.w, s.h, depth);
  body.position.y = s.h / 2;
  const topGeo = box(1, 0.06, 1);
  for (const x of [-s.w / 2 + 0.05, s.w / 2 - 0.05]) {
    const rail = new Mesh(topGeo, basic(theme.line));
    rail.scale.set(0.1, 1, depth);
    rail.position.set(x, s.h + 0.02, 0);
    g.add(rail);
  }
  const front = new Mesh(box(s.w, 0.12, 0.05), basic(0xffd23f));
  front.position.set(0, s.h - 0.1, -depth / 2 - 0.02);
  g.add(body, front);
  return g;
}

function crate() {
  const s = GAME3D.ENEMIES.crate;
  const g = new Group();
  const body = new Mesh(box(s.w, s.h, s.d), M('crate', () => new MeshLambertMaterial({ map: crateTexture(), emissive: 0x1a0d00 })));
  body.position.y = s.h / 2;
  g.add(body);
  g.userData.flash = [body];
  return g;
}

// --------------------------------------------------------------- enemies

function walker() {
  const g = new Group();
  const bodyMat = lambert(0x3a3550, 0x0c0816);
  const body = new Mesh(box(1.0, 0.9, 0.7), bodyMat);
  body.position.y = 1.2;
  const head = new Mesh(box(0.7, 0.4, 0.6), bodyMat);
  head.position.y = 1.85 - 0.2;
  const visor = new Mesh(box(0.5, 0.12, 0.05), basic(0xff2244));
  visor.position.set(0, 1.65, -0.31);
  const eyeGlow = glow(0xff2244, 0.9);
  eyeGlow.position.set(0, 1.65, -0.4);
  const legGeo = box(0.28, 0.75, 0.32);
  const legs = [-0.25, 0.25].map((x) => {
    const pivot = new Group();
    pivot.position.set(x, 0.75, 0);
    const leg = new Mesh(legGeo, lambert(0x24203a, 0x060410));
    leg.position.y = -0.375;
    pivot.add(leg);
    return pivot;
  });
  const armGeo = box(0.2, 0.6, 0.2);
  const arms = [-0.62, 0.62].map((x) => {
    const arm = new Mesh(armGeo, bodyMat);
    arm.position.set(x, 1.15, 0);
    return arm;
  });
  g.add(body, head, visor, eyeGlow, ...legs, ...arms);
  g.userData = { legs, flash: [body, head] };
  return g;
}

function drone() {
  const g = new Group();
  const core = new Mesh(G('droneCore', () => new SphereGeometry(0.38, 16, 12)), lambert(0x2c2a44, 0x10081f));
  core.position.y = 0.5;
  const ring = new Mesh(G('droneRing', () => new TorusGeometry(0.62, 0.07, 8, 24)), basic(0xff8a3d));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.5;
  const eye = new Mesh(G('droneEye', () => new SphereGeometry(0.15, 10, 8)), basic(0xff2244));
  eye.position.set(0, 0.5, -0.32);
  const eyeGlow = glow(0xff3860, 1.0);
  eyeGlow.position.set(0, 0.5, -0.45);
  const rotors = [0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const r = new Mesh(box(0.42, 0.03, 0.08), basic(0xffd23f));
    r.position.set(Math.cos(a) * 0.62, 0.68, Math.sin(a) * 0.62);
    return r;
  });
  g.add(core, ring, eye, eyeGlow, ...rotors);
  g.scale.setScalar(1.3);
  g.userData = { rotors, flash: [core] };
  return g;
}

function boss() {
  const s = GAME3D.BOSS;
  const g = new Group();
  const hull = new Mesh(G('bossHull', () => new SphereGeometry(s.w / 2, 32, 16)), lambert(0x2b2347, 0x120a24));
  hull.scale.set(1, 0.32, 0.7);
  hull.position.y = s.h * 0.45;
  const dome = new Mesh(G('bossDome', () => new SphereGeometry(1.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), basic(0x7ff3ff, { transparent: true, opacity: 0.55 }));
  dome.position.y = s.h * 0.55;
  const ring = new Mesh(G('bossRing', () => new TorusGeometry(s.w / 2 - 0.1, 0.09, 8, 48)), basic(0xff2bd6));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = s.h * 0.45;
  const lights = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const l = new Mesh(G('bossLight', () => new SphereGeometry(0.13, 8, 6)), basic(i % 2 ? 0xffd23f : 0x00f5ff));
    l.position.set(Math.cos(a) * (s.w / 2 - 0.25), s.h * 0.38, Math.sin(a) * (s.w / 2 - 0.25) * 0.7);
    lights.push(l);
  }
  const cannons = [-1.6, 0, 1.6].map((x) => {
    const c = new Mesh(G('bossCannon', () => new CylinderGeometry(0.16, 0.22, 0.9, 10)), lambert(0x15121f, 0x220000));
    c.rotation.x = Math.PI / 2;
    c.position.set(x, s.h * 0.25, -0.9);
    return c;
  });
  const core = glow(0xff2bd6, 3.2);
  core.position.y = s.h * 0.45;
  g.add(core, hull, dome, ring, ...lights, ...cannons);
  // Drawn larger than its hitbox so it looks imposing from the chase camera.
  g.scale.setScalar(1.6);
  g.userData = { ring, lights, flash: [hull] };
  return g;
}

// --------------------------------------------------------------- pickups

function coin() {
  const g = new Group();
  const c = new Mesh(G('coin', () => new CylinderGeometry(0.4, 0.4, 0.1, 20)), lambert(0xffc83d, 0x7a4a00));
  c.rotation.x = Math.PI / 2;
  c.position.y = 0.45;
  const halo = glow(0xffd23f, 1.1);
  halo.position.y = 0.45;
  g.add(halo, c);
  g.userData = { spin: c };
  return g;
}

function gem() {
  const g = new Group();
  const c = new Mesh(G('gem', () => new OctahedronGeometry(0.45)), lambert(0x3fd0ff, 0x1a4a8a));
  c.position.y = 0.55;
  c.scale.y = 1.3;
  const halo = glow(0x3fd0ff, 1.5);
  halo.position.y = 0.55;
  g.add(halo, c);
  g.userData = { spin: c };
  return g;
}

const POWERUP_COLORS = { shield: 0x39ff88, magnet: 0xff3860, rapid: 0xff8a3d, heart: 0xff5ad9, double: 0xffd23f };

function powerup(type) {
  const g = new Group();
  const color = POWERUP_COLORS[type] ?? 0xffffff;
  const bubble = new Mesh(G('bubble', () => new SphereGeometry(0.55, 20, 14)), basic(color, { transparent: true, opacity: 0.28, depthWrite: false, side: DoubleSide }));
  bubble.position.y = 0.55;
  const icon = new Sprite(M(`pu_${type}`, () => new SpriteMaterial({ map: powerupIconTexture(type), color, transparent: true })));
  icon.scale.set(0.7, 0.7, 0.7);
  icon.position.y = 0.55;
  const halo = glow(color, 1.8);
  halo.position.y = 0.55;
  g.add(halo, bubble, icon);
  g.userData = { bob: true };
  return g;
}

// ------------------------------------------------------------------ shots

export function playerShot(color) {
  const g = new Group();
  const core = new Mesh(G('shot', () => new CylinderGeometry(0.06, 0.06, 1.2, 6)), basic(0xffffff));
  core.rotation.x = Math.PI / 2;
  const tint = new Mesh(G('shotGlow', () => new CylinderGeometry(0.14, 0.14, 1.4, 6)), basic(color, { transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false }));
  tint.rotation.x = Math.PI / 2;
  g.add(tint, core);
  return g;
}

export function enemyShot() {
  const g = new Group();
  const core = new Mesh(G('plasma', () => new SphereGeometry(GAME3D.BULLETS.enemyRadius, 12, 10)), basic(0xffe0d0));
  const halo = glow(0xff3d00, 1.6);
  g.add(halo, core);
  return g;
}

// ----------------------------------------------------------------- export

/** Builds the mesh for a world entity. */
export function buildEntity(e, theme) {
  switch (e.type) {
    case 'barrier':
      return barrier();
    case 'beam':
      return beam();
    case 'wall':
      return wall(theme);
    case 'platform':
      return platform(theme, e.d);
    case 'crate':
      return crate();
    case 'walker':
      return walker();
    case 'drone':
      return drone();
    case 'boss':
      return boss();
    case 'coin':
      return coin();
    case 'gem':
      return gem();
    default:
      return powerup(e.type);
  }
}

/** Pool key: platforms depend on their length, walls on the zone color. */
export function poolKey(e, theme) {
  if (e.type === 'platform') return `platform_${e.d}_${theme.id}`;
  if (e.type === 'wall') return `wall_${theme.id}`;
  return e.type;
}

/** Briefly flashes the meshes listed in userData.flash (hit feedback). */
export function flash(object3d, on) {
  for (const m of object3d.userData.flash ?? []) {
    if (!m.userData.baseEmissive) m.userData.baseEmissive = m.material.emissive?.clone() ?? new Color(0);
    if (!m.userData.flashMat) {
      m.userData.flashMat = m.material.clone();
      m.userData.baseMat = m.material;
      m.userData.flashMat.emissive = new Color(0xffffff);
    }
    m.material = on ? m.userData.flashMat : m.userData.baseMat;
  }
}
