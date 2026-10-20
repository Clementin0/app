import { Color } from 'three';

/**
 * Shader tweaks shared by many materials (patched with onBeforeCompile, so
 * they keep Three's lighting and fog):
 *  - neon rim light: a fresnel glow in the zone's color around every model,
 *    so silhouettes read at speed and catch the bloom;
 *  - wet road: the sun reflected down the middle of the road, rippling.
 */
export const RIM = {
  color: { value: new Color(0x00f5ff) },
  strength: { value: 0.5 },
};

export const ROAD = {
  sun: { value: new Color(0xff8a3d) },
  time: { value: 0 },
  amount: { value: 0.5 },
};

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

/** The road: a rippling reflection of the sun along its middle. */
export function withRoadReflection(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.sunColor = ROAD.sun;
    shader.uniforms.roadTime = ROAD.time;
    shader.uniforms.reflection = ROAD.amount;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 sunColor;\nuniform float roadTime;\nuniform float reflection;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #ifdef USE_MAP
        {
          float across = vMapUv.x - 0.5;
          float depth = -vViewPosition.z;
          float streak = exp(-across * across * 30.0) * smoothstep(4.0, 45.0, depth) * (1.0 - smoothstep(100.0, 200.0, depth));
          float ripple = 0.65 + 0.35 * sin(depth * 0.85 - roadTime * 4.0 + sin(across * 26.0 + roadTime));
          totalEmissiveRadiance += sunColor * streak * ripple * reflection;
        }
        #endif`,
      );
  };
  material.customProgramCacheKey = () => 'wet-road';
  return material;
}
