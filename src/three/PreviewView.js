import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, TorusGeometry, Vector3 } from 'three';
import { DEFAULT_EQUIPPED, getItem } from '../config/cosmetics.js';
import { animateCharacter, buildCharacter } from './Character.js';
import { Particles } from './Particles.js';

/**
 * Shop preview: the character with the equipped (or tried-on) items,
 * spinning on a neon pedestal on the left of the screen.
 */
export class PreviewView {
  constructor(stage, { equipped = DEFAULT_EQUIPPED, screenX = -0.28 } = {}) {
    this.stage = stage;
    this.time = 0;
    this.screenX = screenX;
    this.root = new Group();
    stage.scene.add(this.root);
    stage.environment.setTheme(0, true);

    this.pedestal = new Group();
    const top = new Mesh(new CylinderGeometry(1.15, 1.25, 0.3, 32), new MeshLambertMaterial({ color: 0x1b0840, emissive: 0x0a0420 }));
    top.position.y = -0.15;
    this.ring = new Mesh(new TorusGeometry(1.2, 0.05, 8, 48), new MeshBasicMaterial({ color: 0x00f5ff }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.01;
    this.pedestal.add(top, this.ring);
    this.root.add(this.pedestal);

    this.particles = new Particles(stage.scene, 120);
    this.setEquipped(equipped);
  }

  get speed() {
    return 0;
  }

  setEquipped(equipped) {
    if (this.character) this.root.remove(this.character);
    this.equipped = { ...equipped };
    this.character = buildCharacter(this.equipped);
    this.root.add(this.character);
    this.trail = getItem('trail', this.equipped.trail)?.colors ?? [0x00f5ff];
    this.ring.material.color.setHex(getItem('weapon', this.equipped.weapon)?.color ?? 0x00f5ff);
    this.particles.burst(0, 1, 0, this.trail, 30, 4, 0.8, { up: 2 });
  }

  update(dt) {
    this.time += dt;
    const cam = this.stage.camera;
    // Put the pedestal at `screenX` (fraction of the half-width, negative = left).
    const aspect = cam.aspect;
    const dist = 5.2;
    const halfW = Math.tan((cam.fov * Math.PI) / 360) * dist * aspect;
    const px = -this.screenX * halfW; // +x is screen-left
    cam.position.set(0, 1.7, -dist);
    cam.lookAt(new Vector3(0, 1.0, 0));
    this.root.position.set(px, 0, 0);

    this.character.rotation.y = Math.PI + Math.sin(this.time * 0.6) * 0.9;
    animateCharacter(this.character, { time: this.time, grounded: true, sliding: false, vy: 0 });
    this.character.userData.legs.forEach((l) => (l.rotation.x = 0));
    this.ring.rotation.z += dt;
    if (Math.random() < dt * 8) this.particles.burst(px + (Math.random() - 0.5) * 2, 0.1, (Math.random() - 0.5) * 2, this.trail, 1, 0.8, 1.2, { up: 2.5 });
    this.particles.update(dt, 0);
  }

  dispose() {
    this.particles.dispose();
    this.stage.scene.remove(this.root);
  }
}
