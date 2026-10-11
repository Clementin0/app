/**
 * Final look of the frame (after bloom): chromatic aberration towards the
 * edges, saturation, vignette, a colored edge flash (damage, boost) and
 * very soft scanlines. Pulses are driven by Stage.pulse().
 */
export const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    aberration: { value: 0.0015 },
    saturation: { value: 1.12 },
    vignette: { value: 0.55 },
    tint: { value: [1, 0.15, 0.3] },
    tintAmount: { value: 0 },
    scanlines: { value: 0.035 },
    resolutionY: { value: 720 },
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
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float d = length(c);
      vec2 shift = c * aberration * (1.0 + d * 2.0);
      vec3 col = vec3(
        texture2D(tDiffuse, vUv + shift).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - shift).b
      );
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      col = mix(col, tint * max(l, 0.35) * 1.6, tintAmount * smoothstep(0.18, 0.75, d));
      col *= 1.0 - vignette * smoothstep(0.32, 0.9, d);
      col *= 1.0 - scanlines * (0.5 + 0.5 * sin(vUv.y * resolutionY * 3.14159));
      gl_FragColor = vec4(col, 1.0);
    }`,
};
