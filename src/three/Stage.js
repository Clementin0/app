import { HalfFloatType, PerspectiveCamera, Scene, SRGBColorSpace, Vector2, WebGLRenderer, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Environment } from './Environment.js';
import { GradeShader } from './GradeShader.js';

/**
 * Render settings per quality level (chosen in Settings or automatically).
 * `post`: bloom + grading; `msaa`: multisampling of the post-processing target.
 */
export const QUALITY = Object.freeze({
  low: { pixelRatio: 1, antialias: false, post: false, msaa: 0, bloom: 0, buildings: 24, particles: 220, trail: false, weather: 120, props: 0.5 },
  medium: { pixelRatio: 1.25, antialias: false, post: true, msaa: 0, bloom: 0.85, buildings: 44, particles: 420, trail: true, weather: 260, props: 0.8 },
  high: { pixelRatio: 2, antialias: false, post: true, msaa: 4, bloom: 1.0, buildings: 64, particles: 700, trail: true, weather: 420, props: 1 },
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
    this.pulses = { tint: 0, aberration: 0, tintColor: [1, 0.15, 0.3] };
    this.overdrive = 0; // 0..1, set by the game view
    this._createRenderer();
    this.environment = new Environment(this.scene, this.quality);
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
    this._createComposer();
  }

  /** Bloom + grading chain (medium / high). Low renders straight to the screen. */
  _createComposer() {
    if (this.composer) {
      // The composer only frees its own targets: the passes hold the rest
      // (bloom mips, shader materials).
      for (const pass of this.composer.passes) pass.dispose?.();
      this.composer.dispose();
    }
    this.composer = null;
    this.bloom = null;
    this.grade = null;
    if (!this.quality.post) return;
    const size = this.renderer.getDrawingBufferSize(new Vector2());
    const target = new WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: HalfFloatType, samples: this.quality.msaa });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    // Only bright neon (unlit materials, glows, the sun) passes the threshold.
    this.bloom = new UnrealBloomPass(new Vector2(size.x, size.y), this.quality.bloom, 0.55, 0.72);
    composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    composer.addPass(this.grade);
    composer.addPass(new OutputPass());
    this.composer = composer;
    this._sizeComposer();
  }

  _sizeComposer() {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.grade.uniforms.resolutionY.value = window.innerHeight;
  }

  /** Short screen effect: 'hurt' (red edges + aberration), 'boost', 'boss'. */
  pulse(kind) {
    const p = this.pulses;
    if (kind === 'hurt') {
      p.tint = 0.85;
      p.aberration = 0.012;
      p.tintColor = [1, 0.1, 0.25];
    } else if (kind === 'boost') {
      p.tint = 0.45;
      p.aberration = 0.008;
      p.tintColor = [0.2, 0.9, 1];
    } else if (kind === 'boss') {
      p.tint = 0.5;
      p.aberration = 0.006;
      p.tintColor = [1, 0.2, 0.85];
    } else if (kind === 'flash') {
      p.tint = 0.4;
      p.tintColor = [0.85, 0.9, 1];
    } else if (kind === 'overdrive') {
      p.tint = 0.8;
      p.aberration = 0.01;
      p.tintColor = [1, 0.35, 0.95];
    }
  }

  setQuality(name) {
    if (!QUALITY[name] || name === this.qualityName) return;
    const before = this.quality;
    this.qualityName = name;
    this.quality = QUALITY[name];
    if (before.antialias !== this.quality.antialias) this._createRenderer();
    this.environment.setBuildingCount(this.quality.buildings);
    this.environment.setDetail?.(this.quality);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio));
    if (before.post !== this.quality.post || before.msaa !== this.quality.msaa || before.bloom !== this.quality.bloom) this._createComposer();
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this._sizeComposer();
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
    this.environment.update(step, this.view?.speed ?? 0, this.camera);
    if (!this.composer) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    // Screen pulses fade out quickly.
    const p = this.pulses;
    p.tint = Math.max(0, p.tint - step * 2.2);
    p.aberration = Math.max(0, p.aberration - step * 0.03);
    const u = this.grade.uniforms;
    // Overdrive keeps magenta edges and richer colors while it runs.
    const od = this.overdrive;
    u.tintAmount.value = Math.max(p.tint, od * 0.4);
    u.tint.value = p.tint > od * 0.4 ? p.tintColor : [1, 0.35, 0.95];
    u.saturation.value = 1.12 + od * 0.35;
    u.time.value += step;
    // Speed blur in turbo and overdrive; zone looks (heat haze, underwater).
    const env = this.environment;
    u.radial.value = env.boost * 0.9 + od * 0.35;
    const zone = env.theme?.id;
    u.haze.value += ((zone === 'inferno' ? 1 : 0) - u.haze.value) * Math.min(1, step * 2);
    u.underwater.value += ((zone === 'abyss' ? 1 : 0) - u.underwater.value) * Math.min(1, step * 2);
    // Turbo keeps a light aberration on, for the sense of speed.
    u.aberration.value = 0.0015 + p.aberration + this.environment.boost * 0.0025;
    this.composer.render(step);
  }
}
