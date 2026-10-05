import { AdditiveBlending, Group, Mesh, MeshBasicMaterial, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { DEFAULT_EQUIPPED, getItem } from '../config/cosmetics.js';
import { animateCharacter, buildCharacter } from './Character.js';
import { buildEntity, enemyShot, flash, playerShot, poolKey } from './models.js';
import { Particles } from './Particles.js';

/** Logic x grows to the right of the screen; the camera looks +z, so mirror it. */
const X = (x) => -x;

const EXPLOSION = [0xff8a3d, 0xffd23f, 0xff3860, 0xffffff];

/**
 * Renders a LaneWorld in the shared Three.js stage: entity meshes (pooled
 * and keyed by entity id), the player's character, shots, particles and a
 * chase camera. Used by the game and by the menu's demo run.
 */
export class GameView {
  constructor(stage, world, { equipped = DEFAULT_EQUIPPED, effects = true } = {}) {
    this.stage = stage;
    this.world = world;
    this.effects = effects;
    this.time = 0;
    this.root = new Group();
    stage.scene.add(this.root);
    this.theme = stage.environment.setTheme(world.zone.index, true);

    this.character = buildCharacter(equipped);
    this.root.add(this.character);
    this.weaponColor = getItem('weapon', equipped.weapon)?.color ?? 0x00f5ff;
    this.trailColors = getItem('trail', equipped.trail)?.colors ?? [0x00f5ff];

    this.shieldBubble = new Mesh(new SphereGeometry(1.15, 20, 14), new MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.22, depthWrite: false, blending: AdditiveBlending }));
    this.shieldBubble.visible = false;
    this.magnetRing = new Mesh(new TorusGeometry(1.3, 0.05, 6, 32), new MeshBasicMaterial({ color: 0xff3860, transparent: true, opacity: 0.6 }));
    this.magnetRing.rotation.x = Math.PI / 2;
    this.magnetRing.visible = false;
    this.root.add(this.shieldBubble, this.magnetRing);

    this.meshes = new Map();
    this.pools = new Map();
    this.shotMeshes = new Map();
    this.eshotMeshes = new Map();
    this.flashes = new Map();
    this.particles = new Particles(stage.scene, stage.quality.particles);
    this.trailTimer = 0;
    this.muzzleTimer = 0;

    this.shake = 0;
    this.camPos = new Vector3(0, 4.2, -7.4);
    this.camLook = new Vector3(0, 1.3, 12);
    this.tmp = new Vector3();
    this.cameraOffset = { x: 0, y: 0 };
    this.frozen = false;
  }

  /** Scroll speed of the scenery: zero while paused, dead or counting down. */
  get speed() {
    return this.frozen || this.world.state !== 'running' ? 0 : this.world.speed;
  }

  /** After world.reset() (menu demo): fresh visuals. */
  reset() {
    this.character.visible = true;
    this.particles.clear();
    this.theme = this.stage.environment.setTheme(this.world.zone.index, true);
  }

  // ---------------------------------------------------------------- pools

  _acquire(key, make) {
    const list = this.pools.get(key);
    const obj = list?.length ? list.pop() : make();
    obj.visible = true;
    obj.userData.poolKey = key;
    this.root.add(obj);
    return obj;
  }

  _release(obj) {
    obj.visible = false;
    this.root.remove(obj);
    const key = obj.userData.poolKey;
    if (!this.pools.has(key)) this.pools.set(key, []);
    this.pools.get(key).push(obj);
  }

  // -------------------------------------------------------------- effects

  /** Reacts to world events with particles, flashes and camera shake. */
  handleEvents(events) {
    const p = this.world.player;
    const px = X(p.x);
    const ps = this.particles;
    for (const e of events) {
      switch (e.type) {
        case 'shoot':
          this.muzzleTimer = 0.06;
          break;
        case 'hit': {
          const obj = e.boss ? this.bossMesh : this.meshes.get(e.id);
          if (obj) {
            flash(obj, true);
            this.flashes.set(obj, 0.08);
          }
          ps.burst(X(e.x), e.y, e.z - 0.6, [this.weaponColor, 0xffffff], 6, 4, 0.3);
          break;
        }
        case 'kill':
          ps.burst(X(e.x), e.y, e.z, EXPLOSION, e.enemy === 'crate' ? 22 : 34, 7, 0.8);
          this.addShake(0.12);
          break;
        case 'smash':
          ps.burst(X(e.x), e.y, e.z, EXPLOSION, 30, 7, 0.7);
          break;
        case 'hurt':
          this.addShake(0.45);
          ps.burst(px, p.y + 1, 0.4, [0xff3860, 0xffffff], 18, 5, 0.5);
          break;
        case 'coin':
          ps.burst(X(e.x), e.y + 0.45, e.z, [0xffd23f, 0xffffff], 5, 2.5, 0.35);
          break;
        case 'gem':
          ps.burst(X(e.x), e.y + 0.5, e.z, [0x3fd0ff, 0x9d4dff, 0xffffff], 14, 4, 0.5);
          break;
        case 'powerup':
          ps.burst(X(e.x), e.y + 0.5, e.z, [0x39ff88, 0xffd23f, 0xffffff], 22, 5, 0.6);
          break;
        case 'shieldBreak':
          ps.burst(px, 1, 0.5, [0x39ff88, 0xffffff], 30, 7, 0.6);
          this.addShake(0.3);
          break;
        case 'plasmaDestroyed':
          ps.burst(X(e.x), e.y, e.z, [0xff8a3d, 0xffffff], 10, 4, 0.35);
          break;
        case 'shotBlocked':
          ps.burst(X(e.x), e.y, e.z, [this.weaponColor], 5, 3, 0.25);
          break;
        case 'jump':
        case 'land':
          ps.burst(px, p.y + 0.1, 0, [0xd8c8ff], e.type === 'land' ? 8 : 5, 2.2, 0.35, { up: 1 });
          break;
        case 'death':
          ps.burst(px, p.y + 0.9, 0, [this.character.userData.skin.glow, 0xffffff, 0xff3860, 0xffd23f], 70, 9, 1.1);
          this.character.visible = false;
          this.shieldBubble.visible = false;
          this.addShake(0.8);
          break;
        case 'revive':
          this.character.visible = true;
          ps.burst(px, 1, 0, [0x39ff88, 0x00f5ff, 0xffffff], 50, 7, 0.9);
          break;
        case 'bossDefeated':
          for (let i = 0; i < 4; i++) ps.burst(X(e.x) + (Math.random() - 0.5) * 4, e.y + Math.random(), e.z, EXPLOSION, 40, 10, 1.2);
          this.addShake(1);
          break;
        case 'zone':
          this.theme = this.stage.environment.setTheme(e.index);
          break;
        default:
          break;
      }
    }
    return events;
  }

  addShake(amount) {
    if (this.effects) this.shake = Math.min(1.2, this.shake + amount);
  }

  // --------------------------------------------------------------- update

  update(dt) {
    this.time += dt;
    const w = this.world;
    const p = w.player;
    const speed = this.speed;

    this._syncEntities(dt);
    this._syncShots();

    // Player.
    const c = this.character;
    if (w.state !== 'dead') {
      c.position.set(X(p.x), p.y, 0);
      const lean = Math.max(-0.35, Math.min(0.35, (X(p.x) - c.userData.lastX || 0) * 3));
      c.userData.lastX = X(p.x);
      animateCharacter(c, { time: this.time, grounded: p.grounded, sliding: p.slide > 0, vy: p.vy, lean });
      c.visible = p.invulnerable > 0 ? Math.floor(this.time * 14) % 2 === 0 : true;
    }
    c.userData.muzzle.visible = this.muzzleTimer > 0;
    this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);

    this.shieldBubble.visible = p.shield && w.state !== 'dead';
    this.shieldBubble.position.set(X(p.x), p.y + 0.85, 0);
    this.shieldBubble.scale.setScalar(1 + Math.sin(this.time * 6) * 0.04);
    this.magnetRing.visible = p.magnet > 0 && w.state !== 'dead';
    this.magnetRing.position.set(X(p.x), p.y + 0.15, 0);
    this.magnetRing.scale.setScalar(1 + Math.sin(this.time * 10) * 0.08);

    // Neon trail behind the runner.
    if (w.state === 'running' && this.stage.quality.trail) {
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        this.trailTimer = 0.025;
        this.particles.burst(X(p.x) + (Math.random() - 0.5) * 0.4, p.y + 0.5 + Math.random() * 0.5, -0.5, this.trailColors, 1, 0.6, 0.45);
      }
    }
    this.particles.update(dt, speed);

    for (const [obj, t] of this.flashes) {
      const left = t - dt;
      if (left <= 0) {
        flash(obj, false);
        this.flashes.delete(obj);
      } else this.flashes.set(obj, left);
    }

    this._updateCamera(dt);
  }

  _syncEntities(dt) {
    const w = this.world;
    const seen = new Set();
    for (const e of w.entities) {
      let obj = this.meshes.get(e.id);
      if (!obj) {
        obj = this._acquire(poolKey(e, this.theme), () => buildEntity(e, this.theme));
        this.meshes.set(e.id, obj);
      }
      seen.add(e.id);
      obj.position.set(X(e.x), e.y, e.z);
      this._animateEntity(e, obj, dt);
    }
    for (const [id, obj] of this.meshes) {
      if (!seen.has(id)) {
        flash(obj, false);
        this.flashes.delete(obj);
        this._release(obj);
        this.meshes.delete(id);
      }
    }

    // The boss is a single mesh outside the entity list.
    if (w.boss) {
      if (!this.bossMesh) this.bossMesh = this._acquire('boss', () => buildEntity({ type: 'boss' }, this.theme));
      const b = w.boss;
      this.bossMesh.position.set(X(b.x), b.y + Math.sin(this.time * 2) * 0.2, b.z);
      this.bossMesh.rotation.z = Math.sin(this.time * 0.7) * 0.08;
      this.bossMesh.rotation.x = -0.28; // tip the saucer so the camera sees its top
      const { ring, lights } = this.bossMesh.userData;
      ring.rotation.z += dt * 2;
      lights.forEach((l, i) => (l.visible = Math.floor(this.time * 6 + i) % 2 === 0));
    } else if (this.bossMesh) {
      flash(this.bossMesh, false);
      this._release(this.bossMesh);
      this.bossMesh = null;
    }
  }

  _animateEntity(e, obj, dt) {
    const t = this.time + (e.phase ?? e.id * 0.37);
    switch (e.type) {
      case 'walker': {
        const swing = Math.sin(t * 10) * 0.6;
        obj.userData.legs[0].rotation.x = swing;
        obj.userData.legs[1].rotation.x = -swing;
        obj.rotation.y = Math.sin(t * 5) * 0.08;
        break;
      }
      case 'drone':
        for (const r of obj.userData.rotors) r.rotation.y += dt * 30;
        obj.position.y += Math.sin(t * 3) * 0.12;
        obj.rotation.z = Math.sin(t * 2) * 0.15;
        break;
      case 'coin':
      case 'gem':
        obj.userData.spin.rotation.y = t * 4;
        break;
      default:
        if (obj.userData.bob) {
          obj.position.y += Math.sin(t * 3) * 0.15;
          obj.rotation.y = t * 1.5;
        }
    }
  }

  _syncShots() {
    const w = this.world;
    const sync = (list, map, key, make) => {
      const seen = new Set();
      for (const s of list) {
        let obj = map.get(s.id);
        if (!obj) {
          obj = this._acquire(key, make);
          map.set(s.id, obj);
        }
        seen.add(s.id);
        obj.position.set(X(s.x), s.y, s.z);
        if (s.vx) obj.rotation.y = Math.atan2(-s.vx, s.speed);
        else obj.rotation.y = 0;
      }
      for (const [id, obj] of map) {
        if (!seen.has(id)) {
          this._release(obj);
          map.delete(id);
        }
      }
    };
    sync(w.shots, this.shotMeshes, `shot_${this.weaponColor}`, () => playerShot(this.weaponColor));
    sync(w.eshots, this.eshotMeshes, 'eshot', enemyShot);
  }

  _updateCamera(dt) {
    const p = this.world.player;
    const cam = this.stage.camera;
    const k = Math.min(1, dt * 7);
    const px = X(p.x);
    this.tmp.set(px * 0.55 + this.cameraOffset.x, 4.1 + p.y * 0.3 + this.cameraOffset.y, -7.2);
    this.camPos.lerp(this.tmp, k);
    this.tmp.set(px * 0.7, 1.3 + p.y * 0.25, 12);
    this.camLook.lerp(this.tmp, k);
    cam.position.copy(this.camPos);
    if (this.shake > 0) {
      const s = this.shake * 0.35;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    cam.lookAt(this.camLook);
  }

  dispose() {
    this.particles.dispose();
    this.stage.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.isMesh && (o === this.shieldBubble || o === this.magnetRing)) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  }
}
