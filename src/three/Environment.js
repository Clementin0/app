import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three';
import { LANES } from '../config/game3d.config.js';
import { zoneTheme } from '../config/zones.js';
import { dotTexture, drawSky, gridTexture, roadTexture, sunTexture, windowsTexture } from './textures3d.js';

const ROAD_LEN = 320;
const ROAD_CENTER = 140;
const TILE = 8; // meters per road texture tile
const ROAD_HALF = (LANES.count * LANES.width) / 2 + 0.6;
const MAX_BUILDINGS = 64;
const BUILDING_SPAN = [-30, 320];

/**
 * The world around the track: sky, fog, lights, scrolling road and grid,
 * instanced city blocks, sun and stars. Themed per zone.
 */
export class Environment {
  constructor(scene, { buildings = 50 } = {}) {
    this.scene = scene;
    this.themeIndex = -1;
    this.transition = 1;
    this.fogFrom = new Color();
    this.fogTo = new Color();

    // Sky gradient as screen-space background.
    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = 2;
    this.skyCanvas.height = 256;
    this.skyTex = new CanvasTexture(this.skyCanvas);
    this.skyTex.colorSpace = SRGBColorSpace;
    scene.background = this.skyTex;
    scene.fog = new Fog(0x000000, 30, 125);

    this.hemi = new HemisphereLight(0xb9a6ff, 0x1a0838, 1.6);
    this.sunLight = new DirectionalLight(0xffffff, 1.2);
    this.sunLight.position.set(-4, 10, -6);
    scene.add(this.hemi, this.sunLight);

    // Road and side ground.
    this.roadMat = new MeshLambertMaterial({ color: 0xffffff });
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

    // City blocks on both sides.
    this.buildingMat = new MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55 });
    // Allocated for the highest quality; `count` decides how many are drawn.
    const capacity = Math.max(buildings, MAX_BUILDINGS);
    this.count = buildings;
    this.buildings = new InstancedMesh(new BoxGeometry(1, 1, 1), this.buildingMat, capacity);
    this.buildings.count = buildings;
    this.blocks = [];
    for (let i = 0; i < capacity; i++) {
      const side = i % 2 ? 1 : -1;
      this.blocks.push({
        x: side * (ROAD_HALF + 9 + Math.random() * 26),
        z: BUILDING_SPAN[0] + Math.random() * (BUILDING_SPAN[1] - BUILDING_SPAN[0]),
        w: 3 + Math.random() * 5,
        d: 3 + Math.random() * 6,
        h: 6 + Math.random() * 30,
      });
    }
    this.matrix = new Matrix4();
    this._writeBuildings();
    scene.add(this.buildings);

    // Sun and stars ignore the fog.
    this.sunMat = new SpriteMaterial({ fog: false, transparent: true, depthWrite: false });
    this.sun = new Sprite(this.sunMat);
    this.sun.scale.set(150, 150, 1);
    this.sun.position.set(0, 30, 380);
    scene.add(this.sun);

    const starPos = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) {
      const a = Math.random() * Math.PI - Math.PI / 2;
      starPos.set([Math.sin(a) * 350, 40 + Math.random() * 160, 200 + Math.cos(a) * 200], i * 3);
    }
    const starGeo = new BufferGeometry();
    starGeo.setAttribute('position', new BufferAttribute(starPos, 3));
    this.stars = new Points(starGeo, new PointsMaterial({ size: 1.4, map: dotTexture(), color: 0xffffff, transparent: true, fog: false, depthWrite: false, blending: AdditiveBlending }));
    scene.add(this.stars);

    this.scroll = 0;
    this.setTheme(0, true);
  }

  _writeBuildings() {
    for (let i = 0; i < this.count; i++) {
      const b = this.blocks[i];
      this.matrix.makeScale(b.w, b.h, b.d);
      this.matrix.setPosition(b.x, b.h / 2, b.z);
      this.buildings.setMatrixAt(i, this.matrix);
    }
    this.buildings.instanceMatrix.needsUpdate = true;
  }

  /** Number of city blocks drawn (graphics quality). */
  setBuildingCount(n) {
    this.count = Math.max(0, Math.min(n, this.blocks.length));
    this.buildings.count = this.count;
    this._writeBuildings();
  }

  /** Switches palette, textures and lights to the given zone. */
  setTheme(index, instant = false) {
    const theme = zoneTheme(index);
    if (index === this.themeIndex) return theme;
    this.themeIndex = index;
    this.theme = theme;
    this.fogFrom.copy(this.scene.fog.color);
    this.fogTo.setHex(theme.fog);
    this.transition = instant ? 1 : 0;
    if (instant) this.scene.fog.color.copy(this.fogTo);

    drawSky(this.skyCanvas, theme.sky);
    this.skyTex.needsUpdate = true;

    const road = roadTexture(theme.road, theme.line);
    road.repeat.set(1, ROAD_LEN / TILE);
    this.roadMat.map = road;
    this.roadMat.needsUpdate = true;
    const grid = gridTexture(theme.side, theme.grid);
    grid.repeat.set(20, ROAD_LEN / 4);
    this.sideMat.map = grid;
    this.sideMat.needsUpdate = true;
    this.edgeMat.color.setHex(theme.line);

    const win = windowsTexture(theme.window);
    this.buildingMat.map = win;
    this.buildingMat.emissiveMap = win;
    this.buildingMat.color.setHex(theme.building);
    this.buildingMat.needsUpdate = true;

    this.sunMat.map = sunTexture(theme.sun);
    this.sunMat.needsUpdate = true;
    this.hemi.groundColor.setHex(theme.fog);
    return theme;
  }

  update(dt, speed) {
    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + dt / 1.5);
      this.scene.fog.color.lerpColors(this.fogFrom, this.fogTo, this.transition);
    }
    const dz = speed * dt;
    if (dz > 0) {
      this.scroll += dz;
      // The planes are rotated so texture v grows towards -z: a decreasing
      // offset moves the pattern towards the camera.
      if (this.roadMat.map) this.roadMat.map.offset.y = -((this.scroll / TILE) % 1);
      if (this.sideMat.map) this.sideMat.map.offset.y = -((this.scroll / 4) % 1);
      const span = BUILDING_SPAN[1] - BUILDING_SPAN[0];
      for (const b of this.blocks) {
        b.z -= dz;
        if (b.z < BUILDING_SPAN[0]) {
          b.z += span;
          b.h = 6 + Math.random() * 30;
        }
      }
      this._writeBuildings();
    }
  }
}
