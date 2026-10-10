import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, TorusGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DEFAULT_EQUIPPED, getItem } from '../config/cosmetics.js';
import { basic, glow, lambert } from './models.js';

/**
 * The player's runner: a rounded cube with eyes, little legs, a blaster in
 * hand, and an optional hat. Built from primitives so every combination of
 * skin / hat / weapon is available without art files. Faces +z.
 */

const shared = {};
const once = (key, make) => (shared[key] ??= make());

function buildHat(id, color) {
  const g = new Group();
  const m = lambert(color, color, 0.25);
  switch (id) {
    case 'cap': {
      const dome = new Mesh(once('capDome', () => new SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), m);
      const brim = new Mesh(once('capBrim', () => new BoxGeometry(0.5, 0.05, 0.4)), m);
      brim.position.set(0, 0.02, 0.38);
      g.add(dome, brim);
      break;
    }
    case 'antenna': {
      const rod = new Mesh(once('antRod', () => new CylinderGeometry(0.03, 0.03, 0.55, 6)), lambert(0xcccccc));
      rod.position.y = 0.27;
      const ball = new Mesh(once('antBall', () => new SphereGeometry(0.11, 10, 8)), basic(color));
      ball.position.y = 0.58;
      const halo = glow(color, 0.7);
      halo.position.y = 0.58;
      g.add(rod, ball, halo);
      break;
    }
    case 'headphones': {
      const band = new Mesh(once('hpBand', () => new TorusGeometry(0.5, 0.05, 6, 20, Math.PI)), m);
      band.rotation.z = 0;
      band.position.y = -0.15;
      const cupGeo = once('hpCup', () => new CylinderGeometry(0.17, 0.17, 0.14, 14));
      for (const x of [-0.5, 0.5]) {
        const cup = new Mesh(cupGeo, m);
        cup.rotation.z = Math.PI / 2;
        cup.position.set(x, -0.2, 0);
        g.add(cup);
      }
      g.add(band);
      break;
    }
    case 'horns': {
      const hornGeo = once('horn', () => new ConeGeometry(0.1, 0.42, 10));
      for (const x of [-0.3, 0.3]) {
        const h = new Mesh(hornGeo, m);
        h.position.set(x, 0.18, 0);
        h.rotation.z = -Math.sign(x) * 0.35;
        g.add(h);
      }
      break;
    }
    case 'tophat': {
      const brim = new Mesh(once('thBrim', () => new CylinderGeometry(0.42, 0.42, 0.04, 20)), m);
      const top = new Mesh(once('thTop', () => new CylinderGeometry(0.28, 0.28, 0.5, 20)), m);
      top.position.y = 0.27;
      const band = new Mesh(once('thBand', () => new CylinderGeometry(0.285, 0.285, 0.08, 20)), basic(0xff2bd6));
      band.position.y = 0.08;
      g.add(brim, top, band);
      break;
    }
    case 'crown': {
      const base = new Mesh(once('crBase', () => new CylinderGeometry(0.34, 0.34, 0.16, 16, 1, true)), m);
      base.position.y = 0.08;
      const spikeGeo = once('crSpike', () => new ConeGeometry(0.08, 0.2, 6));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const s = new Mesh(spikeGeo, m);
        s.position.set(Math.cos(a) * 0.3, 0.26, Math.sin(a) * 0.3);
        g.add(s);
      }
      const jewel = new Mesh(once('crJewel', () => new SphereGeometry(0.06, 8, 6)), basic(0xff2bd6));
      jewel.position.set(0, 0.1, 0.34);
      g.add(base, jewel);
      break;
    }
    case 'halo': {
      const ring = new Mesh(once('halo', () => new TorusGeometry(0.34, 0.05, 8, 28)), basic(color));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.32;
      const light = glow(color, 1.1);
      light.position.y = 0.32;
      g.add(light, ring);
      break;
    }
    default:
      break;
  }
  return g;
}

function buildWeapon(color) {
  const g = new Group();
  const body = new Mesh(once('gunBody', () => new BoxGeometry(0.16, 0.2, 0.5)), lambert(0x23233a, 0x080812));
  const barrel = new Mesh(once('gunBarrel', () => new CylinderGeometry(0.06, 0.06, 0.32, 8)), basic(color));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.36;
  const muzzle = glow(color, 0.9);
  muzzle.position.z = 0.56;
  muzzle.visible = false;
  g.add(body, barrel, muzzle);
  g.userData.muzzle = muzzle;
  return g;
}

export function buildCharacter(equipped = DEFAULT_EQUIPPED) {
  const skin = getItem('skin', equipped.skin) ?? getItem('skin', 'neon');
  const hat = getItem('hat', equipped.hat) ?? getItem('hat', 'none');
  const weapon = getItem('weapon', equipped.weapon) ?? getItem('weapon', 'blaster');

  const root = new Group();
  const bodyPivot = new Group(); // squash & stretch around the feet
  root.add(bodyPivot);

  const bodyMat = lambert(skin.body, skin.glow, 0.18);
  const body = new Mesh(once('body', () => new RoundedBoxGeometry(0.95, 0.95, 0.9, 4, 0.2)), bodyMat);
  body.position.y = 0.88;
  const belly = new Mesh(once('belly', () => new BoxGeometry(0.6, 0.3, 0.05)), lambert(skin.accent, skin.accent, 0.25));
  belly.position.set(0, 0.6, 0.45);
  const back = new Mesh(once('back', () => new BoxGeometry(0.5, 0.45, 0.12)), lambert(skin.accent, skin.glow, 0.3));
  back.position.set(0, 0.95, -0.48);
  const backLight = new Mesh(once('backLight', () => new BoxGeometry(0.36, 0.06, 0.02)), basic(skin.glow));
  backLight.position.set(0, 1.05, -0.55);

  // Eyes on the front (seen in the menu / shop preview).
  const eyeGeo = once('eye', () => new SphereGeometry(0.13, 12, 10));
  const pupilGeo = once('pupil', () => new SphereGeometry(0.065, 10, 8));
  for (const x of [-0.2, 0.2]) {
    const eye = new Mesh(eyeGeo, basic(0xffffff));
    eye.scale.z = 0.5;
    eye.position.set(x, 1.0, 0.44);
    const pupil = new Mesh(pupilGeo, basic(0x120530));
    pupil.position.set(x, 0.99, 0.5);
    bodyPivot.add(eye, pupil);
  }

  const legGeo = once('leg', () => new BoxGeometry(0.24, 0.42, 0.28));
  const legs = [-0.22, 0.22].map((x) => {
    const pivot = new Group();
    pivot.position.set(x, 0.42, 0);
    const leg = new Mesh(legGeo, lambert(skin.accent, 0x000000));
    leg.position.y = -0.21;
    pivot.add(leg);
    root.add(pivot);
    return pivot;
  });

  const gun = buildWeapon(weapon.color);
  // Seen from behind (camera looks +z, so +x is screen-left): the gun is held on the right.
  gun.position.set(-0.58, 0.82, 0.25);
  const hatObj = buildHat(hat.id, hat.color);
  hatObj.position.y = 1.36;

  // Jetpack (shown while flying): two tanks and their flames.
  const jetpack = new Group();
  const tankGeo = once('tank', () => new CylinderGeometry(0.13, 0.13, 0.55, 12));
  const flames = [];
  for (const x of [-0.18, 0.18]) {
    const tank = new Mesh(tankGeo, lambert(0x8a8aa8, 0x101020));
    tank.position.set(x, 0.95, -0.58);
    const flame = glow(0xff8a3d, 0.7);
    flame.position.set(x, 0.55, -0.58);
    jetpack.add(tank, flame);
    flames.push(flame);
  }
  jetpack.visible = false;

  bodyPivot.add(body, belly, back, backLight, gun, hatObj, jetpack);
  root.userData = { bodyPivot, legs, gun, muzzle: gun.userData.muzzle, skin, weapon, jetpack, flames };
  return root;
}

/** Running / jumping / sliding pose. */
export function animateCharacter(char, { time, grounded, sliding, vy, lean = 0 }) {
  const { bodyPivot, legs } = char.userData;
  const run = grounded && !sliding;
  const swing = run ? Math.sin(time * 16) * 0.7 : grounded ? 0 : 0.5;
  legs[0].rotation.x = swing;
  legs[1].rotation.x = -swing;
  for (const l of legs) l.visible = !sliding;
  if (sliding) {
    bodyPivot.scale.set(1.15, 0.5, 1.1);
    bodyPivot.position.y = -0.25;
  } else if (!grounded) {
    const stretch = Math.max(-0.12, Math.min(0.15, vy / 70));
    bodyPivot.scale.set(1 - stretch, 1 + stretch, 1);
    bodyPivot.position.y = 0;
  } else {
    bodyPivot.scale.set(1, 1 + Math.sin(time * 32) * 0.03, 1);
    bodyPivot.position.y = Math.abs(Math.sin(time * 16)) * 0.06;
  }
  char.rotation.z = lean;
}
