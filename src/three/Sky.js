import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

/**
 * Animated sky dome drawn behind everything: a gradient with a glowing
 * horizon, twinkling stars, a drifting nebula, an aurora (ice) and the odd
 * shooting star. Per-zone looks come from setLook(); `detail` = 0 (low
 * quality) skips the nebula noise.
 */
const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // always at the far plane
  }`;

const fragmentShader = /* glsl */ `
  uniform vec3 top;
  uniform vec3 mid;
  uniform vec3 horizon;
  uniform vec3 nebulaA;
  uniform vec3 nebulaB;
  uniform vec3 auroraColor;
  uniform float stars;
  uniform float nebula;
  uniform float aurora;
  uniform float time;
  uniform float dim;
  uniform float flash;
  uniform float detail;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * noise(p);
      p *= 2.1;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    // Gradient: horizon -> mid -> top, with a hot band right at the horizon.
    vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.18, h));
    col = mix(col, top, smoothstep(0.18, 0.75, h));
    col += horizon * 0.28 * exp(-abs(h - 0.02) * 34.0);

    // Nebula: slow drifting clouds of two colors.
    if (detail > 0.5 && nebula > 0.0) {
      vec3 q = d * 3.0 + vec3(time * 0.01, 0.0, time * 0.006);
      float n = fbm(q);
      float m = fbm(q * 1.7 + 5.0);
      float cloud = smoothstep(0.45, 0.85, n) * smoothstep(0.02, 0.35, h);
      col += mix(nebulaA, nebulaB, m) * cloud * nebula;
    }

    // Aurora: waving curtains of light over the horizon.
    if (aurora > 0.0) {
      float x = atan(d.x, d.z);
      float wave = sin(x * 6.0 + time * 0.4 + sin(x * 13.0 - time * 0.7) * 0.6);
      float band = exp(-pow((h - 0.34 - wave * 0.05) * 11.0, 2.0)) * smoothstep(0.12, 0.3, h);
      float rays = 0.6 + 0.4 * sin(x * 70.0 + time * 1.5);
      col += auroraColor * band * rays * aurora;
    }

    // Stars: one per cell, twinkling, only above the horizon.
    if (stars > 0.0) {
      vec3 cell = floor(d * 140.0);
      float r = hash(cell);
      if (r > 1.0 - 0.012 * stars) {
        vec3 center = (cell + 0.5) / 140.0;
        float dist = length(d - normalize(center)) * 140.0;
        float tw = 0.6 + 0.4 * sin(time * (2.0 + r * 5.0) + r * 40.0);
        col += vec3(1.0, 0.95, 1.0) * smoothstep(0.55, 0.0, dist) * tw * smoothstep(0.05, 0.3, h);
      }
      // A shooting star every few seconds.
      float cycle = floor(time / 5.0);
      float t = fract(time / 5.0);
      if (t < 0.18) {
        vec3 start = normalize(vec3(hash(vec3(cycle, 1.0, 0.0)) * 2.0 - 1.0, 0.55 + hash(vec3(cycle, 2.0, 0.0)) * 0.3, 1.0));
        vec3 dir = normalize(vec3(-0.9, -0.35, 0.0));
        vec3 head = normalize(start + dir * t * 2.2);
        vec3 toD = d - head;
        float along = dot(toD, -dir);
        float across = length(toD + dir * along);
        float tail = smoothstep(0.25, 0.0, along) * step(0.0, along);
        col += vec3(1.0, 0.9, 1.0) * smoothstep(0.004, 0.0, across) * tail * (1.0 - t / 0.18) * stars;
      }
    }

    col *= 1.0 - dim;
    col = mix(col, vec3(0.85, 0.9, 1.0), flash * 0.5);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

/** Per-zone looks: nebula colors, aurora and star density. */
export const SKY_LOOKS = Object.freeze({
  city: { stars: 0.7, nebula: 0.28, nebulaA: 0xff2bd6, nebulaB: 0x3a1aff, aurora: 0, auroraColor: 0x000000 },
  desert: { stars: 0.6, nebula: 0.18, nebulaA: 0xff8a3d, nebulaB: 0x9d2bff, aurora: 0, auroraColor: 0x000000 },
  ice: { stars: 1, nebula: 0.12, nebulaA: 0x3fd0ff, nebulaB: 0x6a4dff, aurora: 0.22, auroraColor: 0x39ffb0 },
  inferno: { stars: 0.25, nebula: 0.4, nebulaA: 0xff3d00, nebulaB: 0x5a0010, aurora: 0, auroraColor: 0x000000 },
  abyss: { stars: 0.12, nebula: 0.3, nebulaA: 0x0e8f7a, nebulaB: 0x1a3a8a, aurora: 0.1, auroraColor: 0x39ffd2 },
  orbit: { stars: 1.8, nebula: 0.5, nebulaA: 0x9d4dff, nebulaB: 0x2b6aff, aurora: 0, auroraColor: 0x000000 },
});

export class Sky {
  constructor(scene, detail = 1) {
    this.uniforms = {
      top: { value: new Color() },
      mid: { value: new Color() },
      horizon: { value: new Color() },
      nebulaA: { value: new Color() },
      nebulaB: { value: new Color() },
      auroraColor: { value: new Color() },
      stars: { value: 1 },
      nebula: { value: 0 },
      aurora: { value: 0 },
      time: { value: 0 },
      dim: { value: 0 },
      flash: { value: 0 },
      detail: { value: detail },
    };
    this.material = new ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader, side: BackSide, depthWrite: false, depthTest: false, fog: false });
    this.mesh = new Mesh(new SphereGeometry(400, 32, 16), this.material);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.tmp = new Vector3();
  }

  /** colors: the zone's sky gradient [top, mid, horizon]; id: zone theme id. */
  setLook(colors, id) {
    const u = this.uniforms;
    u.top.value.set(colors[0]);
    u.mid.value.set(colors[1]);
    u.horizon.value.set(colors[2]);
    const look = SKY_LOOKS[id] ?? SKY_LOOKS.city;
    u.stars.value = look.stars;
    u.nebula.value = look.nebula;
    u.nebulaA.value.setHex(look.nebulaA);
    u.nebulaB.value.setHex(look.nebulaB);
    u.aurora.value = look.aurora;
    u.auroraColor.value.setHex(look.auroraColor);
  }

  setDetail(detail) {
    this.uniforms.detail.value = detail;
  }

  update(dt, camera, { dim = 0, flash = 0 } = {}) {
    this.uniforms.time.value += dt;
    this.uniforms.dim.value = dim;
    this.uniforms.flash.value = flash;
    if (camera) this.mesh.position.copy(camera.position);
  }
}
