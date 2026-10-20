import { AdditiveBlending, ConeGeometry, DoubleSide, Group, IcosahedronGeometry, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry, Sprite, SpriteMaterial, TorusGeometry, Vector3, WireframeGeometry } from 'three';
import { DEFAULT_EQUIPPED, getItem } from '../config/cosmetics.js';
import { laneX } from '../config/game3d.config.js';
import { animateCharacter, buildCharacter } from './Character.js';
import { buildEntity, enemyShot, flash, heavyShot, laserWave, playerShot, poolKey, quakeWave, RAMP_COLOR, rocketShot, TURBO_COLOR } from './models.js';
import { Particles } from './Particles.js';
import { chevronTexture, dotTexture } from './textures3d.js';

const JET_FLAME = [0xff8a3d, 0xffd23f];
const DRAW_DISTANCE = 100; // ~75% into the fog (Environment: 30..125 m)

/** Logic x grows to the right of the screen; the camera looks +z, so mirror it. */
const X = (x) => -x;

const EXPLOSION = [0xff8a3d, 0xffd23f, 0xff3860, 0xffffff];
const BASE_FOV = 62;
const RINGS = 10; // shockwave rings alive at once
const ROCKET_SMOKE = [0xff8a3d, 0xffd23f, 0x9a9ab0];

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

    // The run's weapon (a daily challenge can force one) drives model and shots.
    const weapon = world.loadout?.weapon ?? equipped.weapon;
    this.character = buildCharacter({ ...equipped, weapon });
    this.root.add(this.character);
    this.weaponColor = getItem('weapon', weapon)?.color ?? 0x00f5ff;
    this.shotKey = `shot_${this.weaponColor}`;
    this.makeShot = () => playerShot(this.weaponColor);
    this.frameStamp = 0;
    this.trailColors = getItem('trail', equipped.trail)?.colors ?? [0x00f5ff];

    this.shieldBubble = new Mesh(new SphereGeometry(1.15, 20, 14), new MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.22, depthWrite: false, blending: AdditiveBlending }));
    this.shieldBubble.visible = false;
    // Turbo: a cyan wake streaming behind the runner.
    const wake = new ConeGeometry(0.6, 2.2, 16, 1, true);
    wake.rotateX(-Math.PI / 2); // tip towards -z
    wake.translate(0, 0, -1.1);
    this.turboAura = new Mesh(wake, new MeshBasicMaterial({ color: TURBO_COLOR, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
    this.turboAura.visible = false;
    this.root.add(this.turboAura);
    // Shockwave rings on explosions (pooled, one material each for the fade).
    const ringGeo = new RingGeometry(0.82, 1, 40);
    this.rings = Array.from({ length: RINGS }, () => {
      const m = new Mesh(ringGeo, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.userData = { t: 1, life: 0.4, size: 4 };
      this.root.add(m);
      return m;
    });
    this.ringIndex = 0;
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
    this.fov = BASE_FOV;
    this.roll = 0;
    this.stormK = 0;
    this.stormOn = false;
    this.lightningTimer = 3;
    this.rocketMeshes = new Map();
    this.heavyMeshes = new Map();
    this.waveMeshes = new Map();
    // Boss shield (hex bubble) and rage aura.
    const shieldGeo = new IcosahedronGeometry(1, 2);
    this.bossShield = new Group();
    this.bossShield.add(
      new Mesh(shieldGeo, new MeshBasicMaterial({ color: 0x7ff3ff, transparent: true, opacity: 0.16, depthWrite: false, blending: AdditiveBlending })),
      new LineSegments(new WireframeGeometry(shieldGeo), new LineBasicMaterial({ color: 0x7ff3ff, transparent: true, opacity: 0.7 })),
    );
    this.bossShield.visible = false;
    this.rageAura = new Sprite(new SpriteMaterial({ map: dotTexture(), color: 0xff1f3d, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.8 }));
    this.rageAura.visible = false;
    this.root.add(this.bossShield, this.rageAura);
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
    this.stormOn = false;
    this.stormK = 0;
    this.stage.environment.setStorm(0);
  }

  /** Expanding shockwave ring on the ground (or in the air) at a view position. */
  ring(x, y, z, color, size = 4, life = 0.4) {
    if (!this.effects) return;
    const m = this.rings[this.ringIndex];
    this.ringIndex = (this.ringIndex + 1) % this.rings.length;
    m.position.set(x, y, z);
    m.material.color.setHex(color);
    m.userData.t = 0;
    m.userData.life = life;
    m.userData.size = size;
    m.visible = true;
  }

  _updateRings(dt, speed) {
    for (const m of this.rings) {
      if (!m.visible) continue;
      const u = m.userData;
      u.t += dt / u.life;
      if (u.t >= 1) {
        m.visible = false;
        continue;
      }
      const ease = 1 - (1 - u.t) * (1 - u.t);
      m.scale.setScalar(0.3 + ease * u.size);
      m.material.opacity = (1 - u.t) * 0.85;
      m.position.z -= speed * dt;
    }
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
          this.ring(X(e.x), 0.15, e.z, 0xff8a3d, e.enemy === 'crate' ? 2.6 : 3.6);
          this.addShake(0.12);
          break;
        case 'smash':
          ps.burst(X(e.x), e.y, e.z, e.turbo ? [TURBO_COLOR, 0xffffff, 0xff8a3d] : EXPLOSION, e.turbo ? 40 : 30, e.turbo ? 9 : 7, 0.7, e.turbo ? { drift: 6 } : undefined);
          if (e.turbo) {
            this.ring(X(e.x), 0.2, e.z, TURBO_COLOR, 3.2, 0.3);
            this.addShake(0.18);
          }
          break;
        case 'turbo':
          if (this.effects) this.stage.pulse('boost');
          this.ring(px, 0.1, 0.5, TURBO_COLOR, 5, 0.45);
          ps.burst(px, 0.4, 0.5, [TURBO_COLOR, 0xffffff], 30, 8, 0.5, { drift: -8 });
          this.addShake(0.2);
          break;
        case 'ramp':
          ps.burst(px, 0.8, 0.4, [RAMP_COLOR, 0xffffff], 26, 6, 0.5, { up: -2 });
          this.ring(px, 0.8, 0.6, RAMP_COLOR, 2.6, 0.35);
          break;
        case 'rocket':
          ps.burst(X(e.x), e.y, 0.2, ROCKET_SMOKE, 6, 2.5, 0.35);
          break;
        case 'hurt':
          this.addShake(0.45);
          if (this.effects) this.stage.pulse('hurt');
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
          ps.burst(X(e.x), e.y, e.z, e.boss ? [0x7ff3ff, 0xffffff] : [this.weaponColor], 5, 3, 0.25);
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
          this.ring(X(e.x), 0.2, e.z, 0xffd23f, 12, 0.8);
          this.ring(X(e.x), 1.5, e.z, 0xff2bd6, 8, 0.6);
          this.addShake(1);
          break;
        case 'zone':
          this.theme = this.stage.environment.setTheme(e.index);
          break;
        case 'bossSpawn':
          if (this.effects) this.stage.pulse('boss');
          break;
        case 'bossShield':
          ps.burst(X(e.x), e.y, e.z, [0x7ff3ff, 0xffffff], 40, 9, 0.7);
          this.ring(X(e.x), e.y, e.z - 1, 0x7ff3ff, 9, 0.5);
          this.addShake(0.3);
          break;
        case 'bossShieldDown':
          ps.burst(X(e.x), e.y, e.z, [0x7ff3ff, 0xffffff], 50, 11, 0.8);
          break;
        case 'bossEnraged':
          if (this.effects) this.stage.pulse('hurt');
          ps.burst(X(e.x), e.y, e.z, [0xff1f3d, 0xff8a3d, 0xffffff], 60, 10, 0.9);
          this.addShake(0.5);
          break;
        case 'bossWave':
          if (e.kind === 'quake') {
            this.addShake(0.35);
            ps.burst(0, 0.3, e.z, [0xff7a1a, 0xffd23f], 40, 8, 0.6, { up: 3 });
          }
          break;
        case 'bossDrop':
          // Mines fall from the boss's belly.
          for (const lane of e.lanes) ps.burst(X(laneX(lane)), 1.2, e.z, [0xffd23f, 0xff6a00, 0xffffff], 14, 4, 0.5, { up: -2 });
          break;
        case 'bossSummon':
          ps.burst(X(e.x), e.y + 1, e.z - 2, [0x3fd0ff, 0xffffff], 40, 8, 0.8);
          this.addShake(0.2);
          break;
        case 'bossSweep':
          this.addShake(0.25);
          break;
        case 'meteorImpact':
          ps.burst(X(e.x), 0.4, e.z, [0xff8a3d, 0xffd23f, 0xff3860, 0xffffff], 40, 9, 0.8, { up: 4 });
          this.ring(X(e.x), 0.12, e.z, 0xff6a00, 5, 0.5);
          this.addShake(e.hit ? 0.6 : 0.25);
          break;
        case 'bomberDrop':
          ps.burst(X(e.x), e.y + 0.2, e.z - 1, [0xff2244, 0xffd23f], 8, 2.5, 0.35);
          break;
        case 'chargerCharge':
          this.addShake(0.12);
          break;
        case 'explosion':
          ps.burst(X(e.x), e.y, e.z, [0xff6a00, 0xffd23f, 0xffffff], 36, 9, 0.6);
          this.ring(X(e.x), Math.max(0.15, e.y - 0.6), e.z, e.rocket ? 0xb6ff3d : 0xff6a00, (e.radius ?? 2) * 1.6, 0.35);
          this.addShake(e.rocket ? 0.12 : 0.2);
          break;
        case 'jetpack':
          ps.burst(px, 0.4, 0, [0xff8a3d, 0xffd23f, 0xffffff], 30, 6, 0.6);
          break;
        case 'shieldRegen':
          ps.burst(px, 1, 0.3, [0x39ff88, 0xffffff], 24, 5, 0.5);
          break;
        case 'heal':
          ps.burst(px, 1.2, 0.3, [0xff5ad9, 0xffffff], 20, 4, 0.5, { up: 2 });
          break;
        case 'eventStart':
          this.addShake(0.15);
          if (e.event === 'storm') this.stormOn = true;
          break;
        case 'eventEnd':
          if (e.event === 'storm') this.stormOn = false;
          break;
        default:
          break;
      }
    }
    return events;
  }

  /** Projects a world point (logic coordinates) to normalized screen coordinates (0..1, y down). */
  screenPoint(x, y, z, out = { x: 0, y: 0, visible: false }) {
    const v = this.tmp.set(X(x), y, z).project(this.stage.camera);
    out.x = (v.x + 1) / 2;
    out.y = (1 - v.y) / 2;
    out.visible = v.z < 1 && out.x > -0.1 && out.x < 1.1;
    return out;
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
      // World time: the run cycle stops with the game (pause, countdown, tutorial freeze).
      animateCharacter(c, { time: w.time, grounded: p.grounded, sliding: p.slide > 0, vy: p.vy, lean });
      c.visible = p.invulnerable > 0 ? Math.floor(this.time * 14) % 2 === 0 : true;
    }
    c.userData.muzzle.visible = this.muzzleTimer > 0;
    // Jetpack: visible only while flying, with flickering flames.
    const flying = p.jetpack > 0 && w.state !== 'dead';
    c.userData.jetpack.visible = flying;
    if (flying) {
      for (const f of c.userData.flames) f.scale.setScalar(0.6 + Math.random() * 0.4);
      if (!this.frozen && Math.random() < dt * 40) this.particles.burst(X(p.x) + (Math.random() < 0.5 ? -0.18 : 0.18), p.y + 0.45, -0.6, JET_FLAME, 1, 1.5, 0.35);
    }
    this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);

    this.shieldBubble.visible = p.shield && w.state !== 'dead';
    this.shieldBubble.position.set(X(p.x), p.y + 0.85, 0);
    this.shieldBubble.scale.setScalar(1 + Math.sin(this.time * 6) * 0.04);
    this.magnetRing.visible = p.magnet > 0 && w.state !== 'dead';
    this.magnetRing.position.set(X(p.x), p.y + 0.15, 0);
    this.magnetRing.scale.setScalar(1 + Math.sin(this.time * 10) * 0.08);

    // Neon trail behind the runner.
    if (w.state === 'running' && !this.frozen && this.stage.quality.trail) {
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        this.trailTimer = 0.025;
        this.particles.burst(X(p.x) + (Math.random() - 0.5) * 0.4, p.y + 0.5 + Math.random() * 0.5, -0.5, this.trailColors, 1, 0.6, 0.45);
      }
    }
    // Turbo: aura, speed lines and sparks behind the runner.
    const env = this.stage.environment;
    const boost = w.state === 'dead' ? 0 : p.turboK;
    env.boost = this.effects ? boost : 0;
    this.turboAura.visible = boost > 0.02 && w.state !== 'dead';
    if (this.turboAura.visible) {
      this.turboAura.position.set(X(p.x), p.y + 0.8, -0.3);
      this.turboAura.material.opacity = 0.13 * boost * (0.85 + Math.random() * 0.3);
      if (!this.frozen && Math.random() < dt * 50 * boost) this.particles.burst(X(p.x) + (Math.random() - 0.5) * 0.8, p.y + 0.2 + Math.random() * 1.2, -0.8, [TURBO_COLOR, 0xffffff], 1, 1, 0.3, { drift: -10 });
    }
    // Storm: fog and weather ease in and out; lightning now and then.
    const stormGoal = this.stormOn && w.state !== 'dead' ? 1 : 0;
    if (Math.abs(stormGoal - this.stormK) > 0.001) {
      this.stormK += Math.max(-dt / 2, Math.min(dt / 2, stormGoal - this.stormK));
      env.setStorm(this.stormK);
    }
    if (this.stormK > 0.6 && !this.frozen && this.effects) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 2 + Math.random() * 4;
        env.lightning();
        this.stage.pulse('flash');
      }
    }
    // Pads: the chevrons flow forward.
    const flow = (this.time * 1.6) % 1;
    chevronTexture(TURBO_COLOR).offset.y = -flow;
    chevronTexture(RAMP_COLOR).offset.y = -flow * 0.7;

    this.particles.update(dt, speed);
    this._updateRings(dt, speed);

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
    // Meshes not stamped this frame belong to entities that are gone
    // (no per-frame Set: this runs every frame on low-end phones).
    const stamp = (this.frameStamp = (this.frameStamp + 1) | 0);
    for (const e of w.entities) {
      let obj = this.meshes.get(e.id);
      if (!obj) {
        obj = this._acquire(poolKey(e, this.theme), () => buildEntity(e, this.theme));
        this.meshes.set(e.id, obj);
      }
      obj.userData.stamp = stamp;
      obj.position.set(X(e.x), e.y, e.z);
      // Far away (in the fog) nothing is drawn: saves draw calls on dense rows.
      obj.visible = e.z < DRAW_DISTANCE;
      if (obj.visible) this._animateEntity(e, obj, dt);
    }
    for (const [id, obj] of this.meshes) {
      if (obj.userData.stamp !== stamp) {
        flash(obj, false);
        this.flashes.delete(obj);
        this._release(obj);
        this.meshes.delete(id);
      }
    }

    // The boss is a single mesh outside the entity list.
    if (w.boss) {
      const b = w.boss;
      if (this.bossMesh && this.bossId !== b.id) {
        // A different boss (each zone has its own model).
        flash(this.bossMesh, false);
        this._release(this.bossMesh);
        this.bossMesh = null;
      }
      if (!this.bossMesh) {
        const spec = { type: 'boss', bossKind: b.bossKind };
        this.bossMesh = this._acquire(poolKey(spec, this.theme), () => buildEntity(spec, this.theme));
        this.bossId = b.id;
      }
      this.bossMesh.position.set(X(b.x), b.y + Math.sin(this.time * 2) * 0.2, b.z);
      this.bossMesh.rotation.z = Math.sin(this.time * 0.7) * 0.08;
      this.bossMesh.rotation.x = -0.28; // tip the saucer so the camera sees its top
      const { ring, lights, tentacles, orbit, cube } = this.bossMesh.userData;
      ring.rotation.z += dt * 2;
      if (tentacles) for (let i = 0; i < tentacles.length; i++) tentacles[i].rotation.x = Math.sin(this.time * 2 + i) * 0.35;
      if (orbit) {
        orbit[0].rotation.z += dt * 1.2;
        orbit[1].rotation.z -= dt * 0.9;
        cube.rotation.set(this.time * 1.3, this.time * 1.7, 0);
      }
      for (let i = 0; i < lights.length; i++) lights[i].visible = Math.floor(this.time * 6 + i) % 2 === 0;
      // Shield bubble and rage aura around it.
      const by = this.bossMesh.position.y + b.h * 0.7;
      this.bossShield.visible = b.shield > 0;
      if (b.shield > 0) {
        this.bossShield.position.set(X(b.x), by, b.z);
        this.bossShield.scale.set(5.2, 3.2, 3.6).multiplyScalar(1 + Math.sin(this.time * 9) * 0.02);
        this.bossShield.rotation.y += dt * 0.6;
        // Flickers in its last second.
        this.bossShield.visible = b.shield > 1 || Math.floor(this.time * 14) % 2 === 0;
      }
      this.rageAura.visible = b.enraged;
      if (b.enraged) {
        this.rageAura.position.set(X(b.x), by, b.z + 0.5);
        this.rageAura.scale.setScalar(11 + Math.sin(this.time * 8) * 1.5);
      }
    } else if (this.bossMesh) {
      flash(this.bossMesh, false);
      this._release(this.bossMesh);
      this.bossMesh = null;
    }
    if (!w.boss) {
      this.bossShield.visible = false;
      this.rageAura.visible = false;
    }
  }

  _animateEntity(e, obj, dt) {
    const t = this.world.time + (e.phase ?? e.id * 0.37);
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
      case 'charger': {
        const u = obj.userData;
        // Wind-up: shakes and glows; charge: wheels spin and sparks fly.
        const winding = e.state === 'windup';
        obj.rotation.z = winding ? Math.sin(t * 60) * 0.05 : 0;
        u.eyeGlow.scale.setScalar(winding ? 1.6 + Math.sin(t * 30) * 0.4 : 1);
        if (e.state !== 'windup') for (const w of u.wheels) w.rotation.x -= dt * (e.state === 'charge' ? 40 : 12);
        if (e.state === 'charge' && Math.random() < dt * 30) this.particles.burst(X(e.x), 0.2, e.z + 0.8, [0xffd23f, 0xff6a00], 2, 2, 0.3);
        break;
      }
      case 'turret':
        obj.userData.head.rotation.y = Math.sin(t * 2) * 0.25;
        obj.userData.light.visible = Math.floor(t * 4) % 2 === 0;
        break;
      case 'bomber': {
        obj.position.y += Math.sin(t * 3) * 0.1;
        obj.rotation.z = Math.sin(t * 1.7) * 0.12;
        const flicker = 0.8 + Math.random() * 0.4;
        for (const th of obj.userData.thrusters) th.scale.setScalar(0.9 * flicker);
        obj.userData.bay.visible = Math.floor(t * 5) % 2 === 0;
        break;
      }
      case 'slider':
        for (const l of obj.userData.lights) l.visible = Math.floor(t * 6) % 2 === 0;
        break;
      case 'meteor': {
        // The fireball falls as the fuse burns; the ring pulses faster and faster.
        const u = obj.userData;
        const f = Math.max(0, e.fuse / e.maxFuse);
        u.rock.position.y = 0.6 + this.world.cfg.METEOR.fallHeight * Math.pow(f, 1.4);
        u.rock.rotation.x += dt * 4;
        const pulse = 1 + Math.sin(this.time * (10 + (1 - f) * 25)) * 0.12;
        u.ring.scale.setScalar(pulse);
        u.disc.scale.set(1 - f * 0.6, 1, 1 - f * 0.6);
        break;
      }
      case 'mine':
        obj.userData.spikes.rotation.y = t * 3;
        obj.userData.spikes.rotation.x = t * 1.7;
        obj.userData.light.visible = Math.floor(t * 8) % 2 === 0;
        obj.position.y += Math.sin(t * 4) * 0.06;
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
    const stamp = this.frameStamp;
    this._syncShotList(w.shots, this.shotMeshes, this.shotKey, this.makeShot, stamp, (s) => !s.rocket);
    this._syncShotList(w.shots, this.rocketMeshes, 'rocket', rocketShot, stamp, (s) => s.rocket);
    this._syncShotList(w.eshots, this.eshotMeshes, 'eshot', enemyShot, stamp, (s) => !s.heavy);
    this._syncShotList(w.eshots, this.heavyMeshes, 'eshotHeavy', heavyShot, stamp, (s) => s.heavy);
    this._syncWaves(stamp);
  }

  /** Boss quakes and lasers; a charging laser glows at the boss first. */
  _syncWaves(stamp) {
    const w = this.world;
    for (const wv of w.waves) {
      let obj = this.waveMeshes.get(wv.id);
      if (!obj) {
        obj = this._acquire(`wave_${wv.kind}`, wv.kind === 'quake' ? quakeWave : laserWave);
        this.waveMeshes.set(wv.id, obj);
      }
      obj.userData.stamp = stamp;
      obj.position.set(0, 0, wv.z);
      if (wv.kind === 'laser') {
        const charging = wv.charge > 0;
        const pulse = charging ? 0.25 + 0.75 * (1 - wv.charge / w.cfg.BOSS.laser.charge) : 1;
        obj.userData.beam.scale.set(1, charging ? 0.4 + Math.random() * 0.3 : 1, charging ? 0.4 : 1);
        obj.userData.outer.material.opacity = 0.55 * pulse;
      } else {
        obj.userData.wall.scale.y = 0.85 + Math.random() * 0.3;
      }
    }
    for (const [id, obj] of this.waveMeshes) {
      if (obj.userData.stamp !== stamp) {
        this._release(obj);
        this.waveMeshes.delete(id);
      }
    }
  }

  _syncShotList(list, map, key, make, stamp, filter) {
    for (const s of list) {
      if (filter && !filter(s)) continue;
      let obj = map.get(s.id);
      if (!obj) {
        obj = this._acquire(key, make);
        map.set(s.id, obj);
      }
      obj.userData.stamp = stamp;
      obj.position.set(X(s.x), s.y, s.z);
      obj.rotation.y = s.vx ? Math.atan2(-s.vx, s.speed) : 0;
      if (s.heavy) {
        obj.userData.ring.rotation.z += 0.12;
        obj.userData.spikes.rotation.z -= 0.08;
      } else if (s.rocket) {
        // Nose along the flight; a smoke trail behind.
        obj.rotation.x = -Math.atan2(s.vy, s.speed);
        obj.userData.flame.scale.setScalar(0.7 + Math.random() * 0.5);
        if (!this.frozen && Math.random() < 0.6) this.particles.burst(X(s.x), s.y, s.z - 0.4, ROCKET_SMOKE, 1, 0.8, 0.35);
      }
    }
    for (const [id, obj] of map) {
      if (obj.userData.stamp !== stamp) {
        this._release(obj);
        map.delete(id);
      }
    }
  }

  _updateCamera(dt) {
    const w = this.world;
    const p = w.player;
    const cam = this.stage.camera;
    const k = Math.min(1, dt * 7);
    const px = X(p.x);
    // The camera rises with the jetpack (and big ramp jumps) so the flight stays in frame.
    const lift = p.jetpack > 0 || p.y > 2.5 ? 0.85 : 0.3;
    this.tmp.set(px * 0.55 + this.cameraOffset.x, 4.1 + p.y * lift + this.cameraOffset.y, -7.2);
    this.camPos.lerp(this.tmp, k);
    this.tmp.set(px * 0.7, 1.3 + p.y * (p.jetpack > 0 ? 0.55 : 0.25), 12);
    this.camLook.lerp(this.tmp, k);
    cam.position.copy(this.camPos);
    if (this.shake > 0) {
      const s = this.shake * 0.35;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    cam.lookAt(this.camLook);
    if (!this.effects) return;
    // Wider field of view with speed, much wider in turbo.
    const speedK = Math.min(1, Math.max(0, (w.speed - 15) / 19));
    const fov = BASE_FOV + speedK * 5 + p.turboK * 12;
    this.fov += (fov - this.fov) * Math.min(1, dt * 4);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    // A slight roll into lane changes (from the runner's sideways speed).
    const vx = dt > 0 ? (px - (this.lastPx ?? px)) / dt : 0;
    this.lastPx = px;
    const roll = Math.max(-0.06, Math.min(0.06, vx * 0.0035));
    this.roll += (roll - this.roll) * Math.min(1, dt * 8);
    cam.rotateZ(this.roll);
  }

  dispose() {
    // The camera and environment are shared with the other views.
    const cam = this.stage.camera;
    if (cam.fov !== BASE_FOV) {
      cam.fov = BASE_FOV;
      cam.updateProjectionMatrix();
    }
    this.stage.environment.boost = 0;
    this.stage.environment.setStorm(0);
    this.particles.dispose();
    this.stage.scene.remove(this.root);
    this.rageAura.material.dispose();
    for (const m of this.rings) m.material.dispose();
    this.rings[0].geometry.dispose();
    this.root.traverse((o) => {
      if (o.isMesh && (o === this.shieldBubble || o === this.magnetRing || o === this.turboAura)) {
        o.geometry.dispose();
        o.material.dispose();
      }
      if (o.parent === this.bossShield) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  }
}
