import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  SpotLight,
  Sprite,
  SpriteMaterial,
  WireframeGeometry,
} from 'three';
import { LANES } from '../config/game3d.config.js';
import { zoneTheme } from '../config/zones.js';
import { buildScenery } from './Scenery.js';
import { NO_MIRROR } from './Mirror.js';
import { RIM, ROAD, ROAD_SURFACES, withRoadReflection } from './shading.js';
import { Sky } from './Sky.js';
import { dotTexture, gridTexture, planetTexture, roadTexture, sunTexture } from './textures3d.js';
import { SpeedLines, Weather, WEATHER_TYPES } from './Weather.js';

const ROAD_LEN = 320;
const ROAD_CENTER = 140;
const TILE = 8; // meters per road texture tile
const ROAD_HALF = (LANES.count * LANES.width) / 2 + 0.6;
const ARCH_GAP = 44;
const POLE_GAP = 18;
const RIG_SPAN = [-20, 330];
// How much the scene shows in the road (high quality mirror), per zone.
const MIRROR_LOOKS = { city: 0.55, desert: 0.2, ice: 0.65, inferno: 0.3, abyss: 0.28, orbit: 0.5 };

/** Value noise for the mountain ridges (deterministic). */
function ridge(x, z) {
  const s = Math.sin(x * 0.045) * 0.5 + Math.sin(x * 0.11 + z * 0.07) * 0.3 + Math.sin(x * 0.23 - z * 0.13) * 0.2;
  return Math.max(0, s * 0.5 + 0.5);
}

/**
 * The world around the track: sky, fog and lights, the scrolling road and
 * grid, synthwave wireframe mountains on the horizon, neon arches and light
 * poles along the road, zone scenery (towers, pyramids, crystals, volcanoes,
 * kelp, asteroids), weather particles, speed lines, the sun and a planet.
 */
export class Environment {
  constructor(scene, quality = {}) {
    this.scene = scene;
    this.quality = quality;
    this.themeIndex = -1;
    this.transition = 1;
    this.fogFrom = new Color();
    this.fogTo = new Color();
    this.fogBase = new Color();
    this.white = new Color(0xdde6ff);
    this.stormColor = new Color();
    this.storm = 0;
    this.boost = 0; // 0..1, set by the game view (turbo)
    this.flashK = 0; // lightning

    // Animated sky dome (gradient, stars, nebula, aurora, shooting stars).
    this.sky = new Sky(scene, quality.post ? 1 : 0);
    scene.background = null;
    scene.fog = new Fog(0x000000, 30, 125);

    this.hemi = new HemisphereLight(0xb9a6ff, 0x1a0838, 1.6);
    this.sunLight = new DirectionalLight(0xffffff, 1.2);
    this.sunLight.position.set(-4, 10, -6);
    // The runner's headlight (blackout). Always in the scene, off by default,
    // so the light count never changes (no shader recompiles mid-run).
    this.headlight = new SpotLight(0xfff1d0, 0, 70, 0.42, 0.65, 1.1);
    this.headlight.position.set(0, 2.4, -0.5);
    this.headlight.target.position.set(0, 0, 20);
    scene.add(this.hemi, this.sunLight, this.headlight, this.headlight.target);
    this.blackout = 0;
    this.black = new Color(0x030008);

    // Road and side ground.
    this.roadMat = withRoadReflection(new MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35 }));
    this.road = new Mesh(new PlaneGeometry(ROAD_HALF * 2, ROAD_LEN), this.roadMat);
    this.road.rotation.x = -Math.PI / 2;
    this.road.position.z = ROAD_CENTER;
    this.sideMat = new MeshBasicMaterial({ color: 0xffffff });
    this.sides = [-1, 1].map((s) => {
      const m = new Mesh(new PlaneGeometry(80, ROAD_LEN), this.sideMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(s * (ROAD_HALF + 40), -0.05, ROAD_CENTER);
      return m;
    });
    this.edgeMat = new MeshBasicMaterial({ color: 0xffffff });
    this.edges = [-1, 1].map((s) => {
      const m = new Mesh(new BoxGeometry(0.16, 0.12, ROAD_LEN), this.edgeMat);
      m.position.set(s * ROAD_HALF, 0.06, ROAD_CENTER);
      return m;
    });
    scene.add(this.road, ...this.sides, ...this.edges);
    // The mirror shows what stands on the road, not the road itself.
    for (const m of [this.road, ...this.sides]) m.layers.set(NO_MIRROR);
    ROAD.halfWidth.value = ROAD_HALF;
    this.mirrorStrength = 0;

    this._buildMountains();
    this._buildRig();

    // Sun with a soft halo (the halo stands in for bloom on low quality).
    this.sunMat = new SpriteMaterial({ fog: false, transparent: true, depthWrite: false });
    this.sun = new Sprite(this.sunMat);
    this.sun.scale.set(150, 150, 1);
    this.sun.position.set(0, 30, 380);
    this.haloMat = new SpriteMaterial({ map: dotTexture(), fog: false, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.35 });
    this.halo = new Sprite(this.haloMat);
    this.halo.scale.set(320, 320, 1);
    this.halo.position.set(0, 30, 390);
    scene.add(this.halo, this.sun);

    // Ringed planet (orbit zone).
    this.planet = new Sprite(new SpriteMaterial({ map: planetTexture(0xd6c8ff, 0x3a1a8a, 0x9d4dff), fog: false, transparent: true, depthWrite: false }));
    this.planet.scale.set(150, 150, 1);
    this.planet.position.set(-110, 75, 360);
    scene.add(this.planet);

    // Room for a storm: up to 2.5x the high quality particle count.
    this.weather = new Weather(scene, 1050);
    this.speedLines = new SpeedLines(scene, 36);
    this.weather.points.layers.set(NO_MIRROR);
    this.speedLines.mesh.layers.set(NO_MIRROR);
    this.sceneries = {};
    this.scroll = 0;
    this.setDetail(quality);
    this.setTheme(0, true);
  }

  // --------------------------------------------------------------- parts

  /** Synthwave wireframe mountain range on the horizon, with a valley for the road. */
  _buildMountains() {
    const geo = new PlaneGeometry(700, 110, 96, 18);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const valley = Math.min(1, Math.max(0, (Math.abs(x) - 25) / 90));
      const back = 0.4 + 0.6 * ((z + 55) / 110); // taller towards the back
      pos.setY(i, ridge(x, z) * 52 * valley * back);
    }
    geo.computeVertexNormals();
    this.mountainFill = new MeshBasicMaterial({ color: 0x000000, fog: false });
    this.mountainWire = new LineBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.8 });
    this.mountains = new Group();
    const fill = new Mesh(geo, this.mountainFill);
    const wire = new LineSegments(new WireframeGeometry(geo), this.mountainWire);
    wire.position.y = 0.05;
    this.mountains.add(fill, wire);
    this.mountains.position.set(0, -2, 300);
    this.scene.add(this.mountains);
  }

  /** Neon arches over the road and light poles along it (instanced). */
  _buildRig() {
    const span = RIG_SPAN[1] - RIG_SPAN[0];
    this.archMat = new MeshBasicMaterial({ color: 0xffffff });
    this.arches = new InstancedMesh(new BoxGeometry(1, 1, 1), this.archMat, Math.ceil(span / ARCH_GAP) * 3);
    this.archZ = Array.from({ length: Math.ceil(span / ARCH_GAP) }, (_, i) => RIG_SPAN[0] + 30 + i * ARCH_GAP);
    this.poleMat = new MeshLambertMaterial({ color: 0x1a1430, emissive: 0x0a0618 });
    this.lampMat = new MeshBasicMaterial({ color: 0xffffff });
    const poles = Math.ceil(span / POLE_GAP) * 2;
    this.poles = new InstancedMesh(new BoxGeometry(1, 1, 1), this.poleMat, poles);
    this.lamps = new InstancedMesh(new BoxGeometry(1, 1, 1), this.lampMat, poles);
    this.poleZ = Array.from({ length: Math.ceil(span / POLE_GAP) }, (_, i) => RIG_SPAN[0] + i * POLE_GAP);
    for (const m of [this.arches, this.poles, this.lamps]) m.frustumCulled = false;
    this.dummy = new Object3D();
    this.tint = new Color();
    this.scene.add(this.arches, this.poles, this.lamps);
    this._writeRig();
  }

  _writeRig() {
    const d = this.dummy;
    const set = (mesh, i, x, y, z, sx, sy, sz) => {
      d.position.set(x, y, z);
      d.rotation.set(0, 0, 0);
      d.scale.set(sx, sy, sz);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    };
    // Neon close to the camera fills the screen edges and blooms into
    // giant bars: it dims to a dark silhouette over the last meters.
    const near = (z) => this.tint.setScalar(Math.min(1, Math.max(0.08, (z - 3) / 14)));
    const w = ROAD_HALF + 0.9;
    this.archZ.forEach((z, i) => {
      set(this.arches, i * 3, -w, 3.3, z, 0.25, 6.6, 0.25);
      set(this.arches, i * 3 + 1, w, 3.3, z, 0.25, 6.6, 0.25);
      set(this.arches, i * 3 + 2, 0, 6.6, z, w * 2 + 0.25, 0.25, 0.25);
      near(z);
      for (let k = 0; k < 3; k++) this.arches.setColorAt(i * 3 + k, this.tint);
    });
    this.poleZ.forEach((z, i) => {
      near(z);
      for (const s of [0, 1]) {
        const x = (s ? 1 : -1) * (ROAD_HALF + 2.2);
        set(this.poles, i * 2 + s, x, 2.6, z, 0.16, 5.2, 0.16);
        set(this.lamps, i * 2 + s, x - (s ? 0.35 : -0.35), 5.25, z, 0.9, 0.12, 0.3);
        this.lamps.setColorAt(i * 2 + s, this.tint);
      }
    });
    for (const m of [this.arches, this.poles, this.lamps]) m.instanceMatrix.needsUpdate = true;
    this.arches.instanceColor.needsUpdate = true;
    this.lamps.instanceColor.needsUpdate = true;
  }

  _scenery(theme) {
    if (!this.sceneries[theme.id]) this.sceneries[theme.id] = buildScenery(this.scene, theme, ROAD_HALF, 1);
    return this.sceneries[theme.id];
  }

  // ------------------------------------------------------------- quality

  /** Number of city towers drawn (graphics quality). */
  setBuildingCount(n) {
    this.towerCount = n;
    this.sceneries.city?.[0].setCount(n);
  }

  /** Scenery density and weather particles for a quality level. */
  setDetail(q) {
    this.quality = q;
    this.towerCount = q.buildings ?? 44;
    for (const [id, layers] of Object.entries(this.sceneries)) this._applyDetail(id, layers);
    this.weather.setCount(q.weather ?? 260);
    this.sky?.setDetail(q.post ? 1 : 0);
  }

  _applyDetail(id, layers) {
    const k = this.quality.props ?? 0.8;
    layers.forEach((l, i) => {
      if (id === 'city' && i === 0) l.setCount(this.towerCount);
      else if (l.capacity) l.setCount(l.capacity * k);
    });
  }

  // --------------------------------------------------------------- theme

  /** Switches palette, scenery, weather and sky to the given zone. */
  setTheme(index, instant = false) {
    const theme = zoneTheme(index);
    if (index === this.themeIndex) return theme;
    this.themeIndex = index;
    this.theme = theme;
    this.fogFrom.copy(this.scene.fog.color);
    this.fogTo.setHex(theme.fog);
    this.transition = instant ? 1 : 0;
    if (instant) {
      this.fogBase.copy(this.fogTo);
      this.scene.fog.color.copy(this.fogTo);
    }

    this.sky.setLook(theme.sky, theme.id);
    // Neon rims in the zone's line color; the sun's color on the wet road.
    RIM.color.value.setHex(theme.line).lerp(this.white, 0.15);
    ROAD.sun.value.set(theme.sun[1]);
    const surface = ROAD_SURFACES[theme.id] ?? ROAD_SURFACES.city;
    ROAD.surface.value = surface.id;
    ROAD.surfaceColor.value.setHex(surface.color);
    this.surfaceBase = surface.amount;
    this.mirrorStrength = MIRROR_LOOKS[theme.id] ?? 0.4;
    // Sun rays: softer where the sky is already bright (ice, orbit) or murky (abyss);
    // white suns are dimmed so they do not bloom over half the screen.
    this.sunRays = { ice: 0.3, abyss: 0.55, orbit: 0.5 }[theme.id] ?? 1;
    this.sunMat.color.setScalar({ ice: 0.7, orbit: 0.72, abyss: 0.85 }[theme.id] ?? 1);

    const road = roadTexture(theme.road, theme.line);
    road.repeat.set(1, ROAD_LEN / TILE);
    this.roadMat.map = road;
    this.roadMat.emissiveMap = road;
    this.roadMat.needsUpdate = true;
    const grid = gridTexture(theme.side, theme.grid);
    grid.repeat.set(20, ROAD_LEN / 4);
    this.sideMat.map = grid;
    this.sideMat.needsUpdate = true;
    this.edgeMat.color.setHex(theme.line);

    // Scenery of this zone only.
    const current = this._scenery(theme);
    this._applyDetail(theme.id, current);
    for (const [id, layers] of Object.entries(this.sceneries)) for (const l of layers) l.setVisible(id === theme.id);

    this.mountains.visible = theme.mountains !== false;
    this.mountainFill.color.setHex(theme.side);
    this.mountainWire.color.setHex(theme.grid);
    this.archMat.color.setHex(theme.line);
    this.arches.visible = theme.arches !== false;
    this.lampMat.color.setHex(theme.window[0]);
    this.weather.setType(theme.weather);
    // Storm fog: a dark tint of the zone's weather (sand, snow, rain).
    this.stormColor.setHex(WEATHER_TYPES[theme.weather]?.color ?? 0x808080).multiplyScalar(0.32);
    this.planet.visible = theme.id === 'orbit';

    this.sunMat.map = sunTexture(theme.sun);
    this.sunMat.needsUpdate = true;
    this.haloMat.color.set(theme.sun[1]);
    this.hemi.groundColor.setHex(theme.fog);
    return theme;
  }

  /** Storm event: thicker weather and closer fog (0 = normal). */
  setStorm(k) {
    this.storm = k;
    this.weather.setIntensity(1 + k * 2.5);
    this._applyHaze();
  }

  /** Blackout event: lights out, only neon, the headlight and close fog (0 = normal). */
  setBlackout(k) {
    this.blackout = k;
    this._applyHaze();
    this.headlight.intensity = k * 45;
    this.roadMat.emissiveIntensity = 0.35 * (1 - 0.45 * k);

    this.sideMat.color.setScalar(1 - 0.55 * k);
  }

  /** The headlight follows the runner. */
  aimHeadlight(x, y) {
    this.headlight.position.set(x, y + 2.4, -0.5);
    this.headlight.target.position.set(x * 0.8, 0, 20);
  }

  /** Sun, halo and horizon fade behind a storm or a blackout. */
  _applyHaze() {
    const k = Math.max(this.storm, this.blackout * 1.2);
    this.sunMat.opacity = Math.max(0.04, 1 - k * 0.8);
    this.haloMat.opacity = 0.35 * Math.max(0, 1 - k * 0.75);
    this.mountainWire.opacity = 0.8 * Math.max(0.08, 1 - k * 0.8);
  }

  /** A lightning flash: the sky, fog and lights blink white. */
  lightning() {
    this.flashK = 1;
  }

  update(dt, speed, camera) {
    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + dt / 1.5);
      this.fogBase.lerpColors(this.fogFrom, this.fogTo, this.transition);
    }
    const storm = this.storm;
    const dark = this.blackout;
    const fog = this.scene.fog.color.copy(this.fogBase);
    if (storm > 0) fog.lerp(this.stormColor, storm * 0.6);
    if (dark > 0) fog.lerp(this.black, dark * 0.9);
    let flash = 0;
    if (this.flashK > 0) {
      // Two quick blinks, like real lightning.
      this.flashK = Math.max(0, this.flashK - dt * 3);
      flash = this.flashK * (this.flashK > 0.55 && this.flashK < 0.7 ? 0.3 : 1);
      fog.lerp(this.white, flash * 0.55);
    }
    this.sky.update(dt, camera, { dim: Math.min(0.85, dark * 0.85 + storm * 0.35), flash });
    ROAD.time.value += dt;
    ROAD.scroll.value = this.scroll % 4096;
    ROAD.surfaceAmount.value = (this.surfaceBase ?? 0.5) * (1 - dark * 0.35);
    // The reflection fades with the sun (storm, blackout).
    ROAD.amount.value = 1.1 * (1 - Math.max(storm * 0.7, dark * 0.9));
    this.hemi.intensity = (1.6 + flash * 3) * (1 - 0.72 * dark);
    this.sunLight.intensity = (1.2 + flash * 2) * (1 - 0.85 * dark);
    // Fog closes in during a storm or a blackout.
    this.scene.fog.near = Math.max(6, 30 - storm * 22 - dark * 16);
    this.scene.fog.far = Math.max(50, 125 - storm * 70 - dark * 62);

    const dz = speed * dt;
    if (dz > 0) {
      this.scroll += dz;
      // The planes are rotated so texture v grows towards -z: a decreasing
      // offset moves the pattern towards the camera.
      if (this.roadMat.map) this.roadMat.map.offset.y = -((this.scroll / TILE) % 1);
      if (this.sideMat.map) this.sideMat.map.offset.y = -((this.scroll / 4) % 1);
      const span = RIG_SPAN[1] - RIG_SPAN[0];
      const wrap = (z) => (z - dz < RIG_SPAN[0] ? z - dz + span : z - dz);
      for (let i = 0; i < this.archZ.length; i++) this.archZ[i] = wrap(this.archZ[i]);
      for (let i = 0; i < this.poleZ.length; i++) this.poleZ[i] = wrap(this.poleZ[i]);
      this._writeRig();
    }
    for (const l of this.sceneries[this.theme.id] ?? []) l.update(dz, dt);
    this.weather.update(dt, speed);
    const fast = Math.min(1, Math.max(0, (speed - 26) / 8)) * 0.55;
    this.speedLines.update(dt, speed, Math.max(fast, this.boost), camera?.position.x ?? 0);
  }
}
