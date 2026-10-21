import { HalfFloatType, Matrix4, PerspectiveCamera, Plane, Vector2, Vector3, Vector4, WebGLRenderTarget } from 'three';
import { ROAD } from './shading.js';

/** Layer of what the road mirror skips: the road itself, the ground, shadows, weather. */
export const NO_MIRROR = 1;

const UP = new Vector3(0, 1, 0);
const ORIGIN = new Vector3();
const BIAS = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

/**
 * Planar reflection of the scene in the wet road (high quality): the scene
 * is drawn again, at a fraction of the resolution, from the camera mirrored
 * under the road, with an oblique near plane so nothing under the road
 * shows. The road shader samples it (ROAD.mirrorMap / mirrorMatrix).
 */
export class RoadMirror {
  constructor(scale = 0.35) {
    this.scale = scale;
    this.target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
    this.camera = new PerspectiveCamera();
    this.camera.layers.set(0);
    this.size = new Vector2();
    this.look = new Vector3();
    this.plane = new Plane();
    this.clip = new Vector4();
    this.q = new Vector4();
    ROAD.mirrorMap.value = this.target.texture;
  }

  render(renderer, scene, camera) {
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.round(this.size.x * this.scale));
    const h = Math.max(1, Math.round(this.size.y * this.scale));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);

    // The camera mirrored in the plane y = 0, looking at the mirrored target.
    camera.updateMatrixWorld();
    const v = this.camera;
    v.position.copy(camera.position);
    v.position.y = -v.position.y;
    this.look.set(0, 0, -1).applyQuaternion(camera.quaternion).add(camera.position);
    this.look.y = -this.look.y;
    v.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    v.up.y = -v.up.y;
    v.lookAt(this.look);
    v.far = camera.far;
    v.updateMatrixWorld();
    v.projectionMatrix.copy(camera.projectionMatrix);
    ROAD.mirrorMatrix.value.copy(BIAS).multiply(v.projectionMatrix).multiply(v.matrixWorldInverse);

    // Oblique near plane on the road (Lengyel): clips what lies under it.
    this.plane.setFromNormalAndCoplanarPoint(UP, ORIGIN).applyMatrix4(v.matrixWorldInverse);
    const c = this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const p = v.projectionMatrix.elements;
    const q = this.q.set((Math.sign(c.x) + p[8]) / p[0], (Math.sign(c.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
    c.multiplyScalar(2 / c.dot(q));
    p[2] = c.x;
    p[6] = c.y;
    p[10] = c.z + 1 - 0.003;
    p[14] = c.w;
    v.projectionMatrixInverse.copy(v.projectionMatrix).invert();

    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, v);
    renderer.setRenderTarget(previous);
  }

  dispose() {
    if (ROAD.mirrorMap.value === this.target.texture) ROAD.mirrorMap.value = null;
    ROAD.mirror.value = 0;
    this.target.dispose();
  }
}
