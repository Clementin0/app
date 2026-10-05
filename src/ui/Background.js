/**
 * Parallax synthwave backdrop: gradient sky, stars, sun and two skyline
 * layers scrolling at different speeds.
 */
export class Background {
  constructor(scene) {
    this.scene = scene;
    this.sky = scene.add.image(0, 0, 'sky').setOrigin(0, 0).setDepth(-100);
    this.stars = scene.add.tileSprite(0, 0, 10, 10, 'stars').setOrigin(0, 0).setDepth(-99);
    this.sun = scene.add.image(0, 0, 'sun').setDepth(-98).setAlpha(0.95);
    this.far = scene.add.tileSprite(0, 0, 10, 260, 'skyline_far').setOrigin(0, 1).setDepth(-97);
    this.near = scene.add.tileSprite(0, 0, 10, 220, 'skyline_near').setOrigin(0, 1).setDepth(-96);
    this.time = 0;
  }

  layout(width, height, horizonY = height - 120) {
    this.sky.setDisplaySize(width, height);
    this.stars.setSize(width, horizonY).setPosition(0, 0);
    this.sun.setPosition(width * 0.68, horizonY - 120);
    const sunSize = Math.min(380, height * 0.55);
    this.sun.setDisplaySize(sunSize, sunSize);
    this.far.setSize(width, 260).setPosition(0, horizonY + 6);
    this.near.setSize(width, 220).setPosition(0, horizonY + 6);
  }

  update(dt, speed) {
    this.time += dt;
    this.stars.tilePositionX += speed * 0.02 * dt;
    this.far.tilePositionX += speed * 0.12 * dt;
    this.near.tilePositionX += speed * 0.3 * dt;
    this.stars.setAlpha(0.75 + Math.sin(this.time * 1.7) * 0.15);
  }
}
