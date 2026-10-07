import { PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { Environment } from './Environment.js';

/** Render settings per quality level (chosen in Settings). */
export const QUALITY = Object.freeze({
  low: { pixelRatio: 1, antialias: false, buildings: 24, particles: 220, trail: false },
  medium: { pixelRatio: 1.5, antialias: false, buildings: 44, particles: 420, trail: true },
  high: { pixelRatio: 2, antialias: true, buildings: 64, particles: 700, trail: true },
});

/**
 * The single Three.js canvas, drawn under Phaser's transparent canvas.
 * Scenes plug a "view" into it (game world, menu demo, shop preview); the
 * stage renders once per Phaser frame.
 */
export class Stage {
  constructor(container, quality = 'medium') {
    this.container = container;
    this.qualityName = QUALITY[quality] ? quality : 'medium';
    this.quality = QUALITY[this.qualityName];
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(62, 16 / 9, 0.1, 600);
    this.camera.position.set(0, 4, -7);
    this.view = null;
    this._createRenderer();
    this.environment = new Environment(this.scene, { buildings: this.quality.buildings });
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _createRenderer() {
    if (this.renderer) {
      // Without forceContextLoss the old context stays alive (cached
      // geometries / textures keep listeners pointing at it).
      this.renderer.forceContextLoss();
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    this.renderer = new WebGLRenderer({ antialias: this.quality.antialias, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.domElement.id = 'three';
    this.container.prepend(this.renderer.domElement);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio));
  }

  setQuality(name) {
    if (!QUALITY[name] || name === this.qualityName) return;
    const before = this.quality;
    this.qualityName = name;
    this.quality = QUALITY[name];
    if (before.antialias !== this.quality.antialias) this._createRenderer();
    this.environment.setBuildingCount(this.quality.buildings);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio));
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** Replaces the current view (the previous one is disposed). */
  setView(view) {
    if (this.view && this.view !== view) this.view.dispose();
    this.view = view;
    return view;
  }

  clearView(view) {
    if (this.view === view) {
      this.view.dispose();
      this.view = null;
    }
  }

  frame(dt) {
    const step = Math.min(dt, 0.05);
    this.view?.update(step);
    this.environment.update(step, this.view?.speed ?? 0);
    this.renderer.render(this.scene, this.camera);
  }
}
