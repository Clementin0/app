import { Color, Matrix4 } from 'three';

/**
 * Shader tweaks shared by many materials (patched with onBeforeCompile, so
 * they keep Three's lighting and fog):
 *  - neon rim light: a fresnel glow in the zone's color around every model,
 *    so silhouettes read at speed and catch the bloom;
 *  - the road: the sun reflected down the middle of the road, rippling; an
 *    animated surface per zone (rain ripples, blowing sand, frost glitter,
 *    lava cracks, caustics, holographic pulses); on high quality a real
 *    mirror of the scene (RoadMirror) blended in, wobbling with the ripples.
 */
export const RIM = {
  color: { value: new Color(0x00f5ff) },
  strength: { value: 0.5 },
};

export const ROAD = {
  sun: { value: new Color(0xff8a3d) },
  time: { value: 0 },
  amount: { value: 0.5 },
  // Meters scrolled (kept small: it wraps every few kilometers).
  scroll: { value: 0 },
  halfWidth: { value: 4.2 },
  surface: { value: 0 },
  surfaceColor: { value: new Color(0x7ff3ff) },
  surfaceAmount: { value: 0.5 },
  mirrorMap: { value: null },
  mirrorMatrix: { value: new Matrix4() },
  mirror: { value: 0 },
};

/** Animated road surface of each zone: shader id, color and strength. */
export const ROAD_SURFACES = Object.freeze({
  city: { id: 0, color: 0x7ff3ff, amount: 0.42 }, // rain ripples in the puddles
  desert: { id: 1, color: 0xffb35a, amount: 0.22 }, // sand blowing across
  ice: { id: 2, color: 0xe8fbff, amount: 1.2 }, // frost glitter
  inferno: { id: 3, color: 0xff4a10, amount: 1.1 }, // glowing lava cracks
  abyss: { id: 4, color: 0x39ffd2, amount: 0.45 }, // caustics
  orbit: { id: 5, color: 0xb98cff, amount: 0.55 }, // holographic pulses
});

/** Adds the rim light to a Lambert material; `scale` tones it per material. */
export function withRim(material, scale = 1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = RIM.color;
    shader.uniforms.rimStrength = RIM.strength;
    shader.uniforms.rimScale = { value: scale };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimScale;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float rim = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
          totalEmissiveRadiance += rimColor * pow(rim, 3.0) * rimStrength * rimScale;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'neon-rim';
  return material;
}

const ROAD_COMMON = /* glsl */ `
  uniform vec3 sunColor;
  uniform float roadTime;
  uniform float reflection;
  uniform float roadScroll;
  uniform float roadHalf;
  uniform float surface;
  uniform vec3 surfaceColor;
  uniform float surfaceAmount;
  uniform sampler2D mirrorMap;
  uniform float mirror;
  varying vec4 vMirror;
  varying vec2 vRoad;

  float roadHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float roadNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(roadHash(i), roadHash(i + vec2(1.0, 0.0)), f.x), mix(roadHash(i + vec2(0.0, 1.0)), roadHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  // The zone's animated surface. rp: meters across / along the road (scrolling with it).
  vec3 roadSurface(vec2 rp, float t) {
    if (surface < 0.5) {
      // City: raindrops rippling in the puddles.
      vec2 cell = floor(rp / 1.3);
      vec2 f = fract(rp / 1.3) - 0.5;
      float h = roadHash(cell);
      float ph = fract(t * 0.9 + h * 7.0);
      vec2 c = (vec2(roadHash(cell + 3.1), roadHash(cell + 7.7)) - 0.5) * 0.5;
      float ring = smoothstep(0.045, 0.0, abs(length(f - c) - ph * 0.5)) * (1.0 - ph);
      return surfaceColor * ring * step(0.4, h);
    } else if (surface < 1.5) {
      // Desert: sand streaming across in the wind.
      float n = sin(rp.x * 1.6 - t * 2.6 + rp.y * 0.35 + sin(rp.y * 0.55 + t * 0.7) * 1.8);
      float m = roadNoise(vec2(rp.x * 0.8 - t * 1.4, rp.y * 0.6));
      return surfaceColor * smoothstep(0.75, 1.0, n) * m;
    } else if (surface < 2.5) {
      // Ice: frost crystals catching the light (a point somewhere in some cells).
      vec2 cell = floor(rp / 0.35);
      vec2 f = fract(rp / 0.35);
      float h = roadHash(cell);
      vec2 c = vec2(roadHash(cell + 1.7), roadHash(cell + 4.3)) * 0.7 + 0.15;
      float tw = pow(max(0.0, sin(t * 3.2 + h * 60.0)), 10.0);
      return surfaceColor * step(0.75, h) * tw * smoothstep(0.13, 0.0, length(f - c)) * 2.0;
    } else if (surface < 3.5) {
      // Inferno: cracks with lava glowing through, pulsing.
      float n = roadNoise(rp * 0.42) * 0.65 + roadNoise(rp * 1.3 + 9.0) * 0.35;
      float crack = smoothstep(0.03, 0.0, abs(n - 0.5));
      return surfaceColor * crack * (0.65 + 0.35 * sin(t * 2.4 + rp.y * 0.3));
    } else if (surface < 4.5) {
      // Abyss: caustic light dancing on the sea floor.
      vec2 p = rp * 0.85;
      float a = sin(p.x + sin(p.y * 0.7 + t * 0.9) * 1.7);
      float b = sin(p.y * 0.8 + sin(p.x * 0.9 - t * 0.75) * 1.7);
      return surfaceColor * pow(1.0 - abs(a * b), 7.0);
    }
    // Orbit: holographic scan pulses and a twinkling dot grid.
    float band = smoothstep(0.94, 1.0, sin(rp.y * 0.21 - t * 5.0));
    vec2 g = abs(fract(rp * 1.25) - 0.5);
    float dots = smoothstep(0.08, 0.0, max(g.x, g.y) - 0.4) * (0.5 + 0.5 * sin(t * 2.0 + rp.y * 0.5 + rp.x));
    return surfaceColor * (band + dots * 0.12);
  }
`;

/** The road: sun reflection, zone surface and (high quality) the scene mirrored in it. */
export function withRoadReflection(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.sunColor = ROAD.sun;
    shader.uniforms.roadTime = ROAD.time;
    shader.uniforms.reflection = ROAD.amount;
    shader.uniforms.roadScroll = ROAD.scroll;
    shader.uniforms.roadHalf = ROAD.halfWidth;
    shader.uniforms.surface = ROAD.surface;
    shader.uniforms.surfaceColor = ROAD.surfaceColor;
    shader.uniforms.surfaceAmount = ROAD.surfaceAmount;
    shader.uniforms.mirrorMap = ROAD.mirrorMap;
    shader.uniforms.mirrorMatrix = ROAD.mirrorMatrix;
    shader.uniforms.mirror = ROAD.mirror;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 mirrorMatrix;\nvarying vec4 vMirror;\nvarying vec2 vRoad;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 roadWorld = modelMatrix * vec4(transformed, 1.0);
          vMirror = mirrorMatrix * roadWorld;
          vRoad = roadWorld.xz;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${ROAD_COMMON}`).replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
        #ifdef USE_MAP
        {
          float across = vMapUv.x - 0.5;
          float depth = vViewPosition.z; // distance in front of the camera
          float streak = exp(-across * across * 30.0) * smoothstep(4.0, 45.0, depth) * (1.0 - smoothstep(100.0, 200.0, depth));
          float ripple = 0.65 + 0.35 * sin(depth * 0.85 - roadTime * 4.0 + sin(across * 26.0 + roadTime));
          totalEmissiveRadiance += sunColor * streak * ripple * reflection;
          vec2 rp = vec2(vRoad.x + roadHalf, vRoad.y + roadScroll);
          totalEmissiveRadiance += roadSurface(rp, roadTime) * surfaceAmount;
          if (mirror > 0.0) {
            // The mirrored scene, wobbling with the wet surface; stronger at grazing angles.
            vec2 muv = vMirror.xy / vMirror.w;
            muv += vec2(sin(rp.y * 1.7 + roadTime * 3.0), cos(rp.x * 2.3 + roadTime * 2.0)) * 0.0035;
            vec3 mirrored = texture2D(mirrorMap, muv).rgb;
            totalEmissiveRadiance += mirrored * mirror * smoothstep(1.5, 18.0, depth);
          }
        }
        #endif`,
    );
  };
  material.customProgramCacheKey = () => 'wet-road-v6';
  return material;
}
