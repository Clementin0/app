/**
 * Visual and musical themes. The run cycles through them: each zone ends
 * with a boss fight, then the world changes look, palette and music.
 */
export const ZONE_THEMES = Object.freeze([
  {
    id: 'city',
    nameKey: 'zoneCity',
    sky: ['#07021a', '#2a0b5c', '#ff2bd6'],
    fog: 0x1a0838,
    road: 0x140a2e,
    line: 0x00f5ff,
    side: 0x0d0624,
    grid: 0xff2bd6,
    building: 0x1d0b45,
    window: [0x00f5ff, 0xff2bd6],
    sun: ['#ffe86b', '#ff8a3d', '#ff2bd6'],
    music: 0,
  },
  {
    id: 'desert',
    nameKey: 'zoneDesert',
    sky: ['#2b0a3d', '#b8336a', '#ffb347'],
    fog: 0x6b2a52,
    road: 0x2a1424,
    line: 0xffd23f,
    side: 0x3d1a2a,
    grid: 0xff8a3d,
    building: 0x4a1d3a,
    window: [0xffd23f, 0xff8a3d],
    sun: ['#fff3b0', '#ffb347', '#ff5e62'],
    music: 1,
  },
  {
    id: 'ice',
    nameKey: 'zoneIce',
    sky: ['#020d1f', '#0b3a66', '#7ff3ff'],
    fog: 0x0d3554,
    road: 0x0a1e33,
    line: 0x7ff3ff,
    side: 0x07192b,
    grid: 0x4fc3ff,
    building: 0x10304f,
    window: [0xe0ffff, 0x7ff3ff],
    sun: ['#ffffff', '#b8f7ff', '#4fc3ff'],
    music: 2,
  },
  {
    id: 'inferno',
    nameKey: 'zoneInferno',
    sky: ['#0d0000', '#4a0505', '#ff3d00'],
    fog: 0x3a0606,
    road: 0x1f0505,
    line: 0xff3d00,
    side: 0x150202,
    grid: 0xff6a00,
    building: 0x2e0707,
    window: [0xff6a00, 0xffd23f],
    sun: ['#ffd23f', '#ff6a00', '#b30000'],
    music: 3,
  },
]);

export const zoneTheme = (index) => ZONE_THEMES[((index % ZONE_THEMES.length) + ZONE_THEMES.length) % ZONE_THEMES.length];
