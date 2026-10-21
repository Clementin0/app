/**
 * Final look of the frame (after bloom): chromatic aberration towards the
 * edges, saturation, vignette, a colored edge flash (damage, boost), very
 * soft scanlines, a radial speed blur (turbo, overdrive) and zone effects:
 * heat haze (inferno) and an underwater wobble (abyss). Pulses are driven
 * by Stage.pulse().
 *
 * The sun: god rays (bright pixels around it smeared away from it, so the
 * skyline cuts shafts of light), an anamorphic streak and lens flare
 * ghosts, all fading when buildings hide it. RAY_STEPS sets the ray quality.
 */
export const GradeShader = {
  name: 'GradeShader',
  defines: { RAY_STEPS: 12 },
  uniforms: {
    tDiffuse: { value: null },
    aberration: { value: 0.0015 },
    saturation: { value: 1.12 },
    vignette: { value: 0.55 },
    tint: { value: [1, 0.15, 0.3] },
    tintAmount: { value: 0 },
    scanlines: { value: 0.035 },
    resolutionY: { value: 720 },
    time: { value: 0 },
    radial: { value: 0 },
    haze: { value: 0 },
    underwater: { value: 0 },
    sunPos: { value: [0.5, 0.7] },
    sunColor: { value: [1, 0.55, 0.3] },
    rays: { value: 0 },
    aspect: { value: 16 / 9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float aberration;
    uniform float saturation;
    uniform float vignette;
    uniform vec3 tint;
    uniform float tintAmount;
    uniform float scanlines;
    uniform float resolutionY;
    uniform float time;
    uniform float radial;
    uniform float haze;
    uniform float underwater;
    uniform vec2 sunPos;
    uniform vec3 sunColor;
    uniform float rays;
    uniform float aspect;
    varying vec2 vUv;

    // Sun shafts, streak and flare (added before grading, so they get the zone's look).
    vec3 sunLight(vec2 uv) {
      vec2 toSun = (uv - sunPos) * vec2(aspect, 1.0);
      float dist = length(toSun);
      vec3 add = vec3(0.0);
      // How much of the sun is visible (buildings, storm): its own brightness.
      vec3 disc = texture2D(tDiffuse, sunPos).rgb;
      float seen = clamp(dot(disc, vec3(0.333)) - 0.35, 0.0, 1.0);
      if (dist < 0.95) {
        vec2 stepUv = (uv - sunPos) / float(RAY_STEPS) * 0.85;
        vec2 p = uv;
        float decay = 1.0;
        vec3 acc = vec3(0.0);
        for (int i = 0; i < RAY_STEPS; i++) {
          p -= stepUv;
          vec3 s = texture2D(tDiffuse, p).rgb;
          float b = max(0.0, dot(s, vec3(0.333)) - 0.62);
          acc += s * b * decay;
          decay *= 0.9;
        }
        add += acc / float(RAY_STEPS) * 1.25 * smoothstep(0.95, 0.1, dist);
      }
      // Anamorphic streak across the sun.
      add += sunColor * exp(-abs(toSun.y) * 140.0) * exp(-abs(toSun.x) * 2.6) * 0.32 * seen;
      // Lens flare ghosts on the line from the sun through the center.
      vec2 axis = vec2(0.5) - sunPos;
      for (int k = 0; k < 4; k++) {
        float fk = float(k);
        float at = 0.55 + fk * 0.45;
        float r = 0.035 + fk * 0.022;
        vec2 g = (uv - (sunPos + axis * at)) * vec2(aspect, 1.0);
        float ring = smoothstep(r, r * 0.65, length(g)) * (k == 2 ? 1.6 : 1.0);
        vec3 tint = k == 1 ? vec3(0.4, 0.9, 1.0) : k == 3 ? vec3(1.0, 0.4, 0.9) : sunColor;
        add += tint * ring * 0.05 * seen;
      }
      return add * rays;
    }

    void main() {
      vec2 uv = vUv;
      // Heat shimmer over the road (inferno), slow wobble (abyss).
      uv += vec2(sin(uv.y * 120.0 + time * 8.0), cos(uv.x * 90.0 + time * 6.0)) * 0.0012 * haze * smoothstep(0.75, 0.25, uv.y);
      uv += vec2(sin(uv.y * 14.0 + time * 1.6), cos(uv.x * 12.0 + time * 1.3)) * 0.0032 * underwater;
      vec2 c = uv - 0.5;
      float d = length(c);
      vec2 shift = c * aberration * (1.0 + d * 2.0);
      vec3 col = vec3(
        texture2D(tDiffuse, uv + shift).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv - shift).b
      );
      if (rays > 0.01) col += sunLight(uv);
      // Speed blur: a few taps towards the center, stronger at the edges.
      if (radial > 0.01) {
        vec3 acc = col;
        for (int i = 1; i <= 5; i++) acc += texture2D(tDiffuse, uv - c * radial * 0.018 * float(i)).rgb;
        col = mix(col, acc / 6.0, smoothstep(0.1, 0.55, d));
      }
      // Caustic light ripples underwater.
      col += vec3(0.0, 0.05, 0.045) * underwater * (0.5 + 0.5 * sin(uv.x * 40.0 + time * 2.0) * sin(uv.y * 30.0 - time * 1.7));
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      col = mix(col, tint * max(l, 0.35) * 1.6, tintAmount * smoothstep(0.18, 0.75, d));
      col *= 1.0 - vignette * smoothstep(0.32, 0.9, d);
      col *= 1.0 - scanlines * (0.5 + 0.5 * sin(vUv.y * resolutionY * 3.14159));
      gl_FragColor = vec4(col, 1.0);
    }`,
};
