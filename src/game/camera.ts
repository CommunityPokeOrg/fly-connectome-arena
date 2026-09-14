import { PerspectiveCamera, Vector3, type Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type CameraMode = 'ORBIT FOLLOW' | 'CHASE CAM' | 'TOP DOWN' | 'FREE ORBIT';

export class GameCamera {
  public readonly camera: PerspectiveCamera;
  public readonly controls: OrbitControls;
  public mode: CameraMode = 'ORBIT FOLLOW';
  private readonly desiredPosition = new Vector3();
  private readonly target = new Vector3();
  private readonly lookAhead = new Vector3();

  public constructor(canvas: HTMLCanvasElement) {
    this.camera = new PerspectiveCamera(58, 1, 0.1, 140);
    this.camera.position.set(8, 7, 11);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 45;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.enabled = false;
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  public cycle(): CameraMode {
    const modes: CameraMode[] = ['ORBIT FOLLOW', 'CHASE CAM', 'TOP DOWN', 'FREE ORBIT'];
    const next = (modes.indexOf(this.mode) + 1) % modes.length;
    this.mode = modes[next] as CameraMode;
    this.controls.enabled = this.mode === 'FREE ORBIT';
    if (this.mode === 'TOP DOWN') {
      this.camera.fov = 54;
    } else {
      this.camera.fov = 58;
    }
    this.camera.updateProjectionMatrix();
    return this.mode;
  }

  public update(fly: Object3D, heading: number, dt: number): void {
    this.target.copy(fly.position);
    this.lookAhead.set(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(2.2);
    if (this.mode === 'ORBIT FOLLOW') {
      this.desiredPosition.set(fly.position.x + 8, 6.4, fly.position.z + 9);
      this.camera.position.lerp(this.desiredPosition, Math.min(1, dt * 4));
      this.camera.lookAt(this.target.clone().add(this.lookAhead));
    } else if (this.mode === 'CHASE CAM') {
      this.desiredPosition.set(
        fly.position.x - Math.sin(heading) * 6,
        3.1,
        fly.position.z - Math.cos(heading) * 6,
      );
      this.camera.position.lerp(this.desiredPosition, Math.min(1, dt * 7));
      this.camera.lookAt(this.target.clone().add(this.lookAhead.multiplyScalar(1.8)));
    } else if (this.mode === 'TOP DOWN') {
      this.desiredPosition.set(fly.position.x, 20, fly.position.z + 0.01);
      this.camera.position.lerp(this.desiredPosition, Math.min(1, dt * 5));
      this.camera.lookAt(this.target);
    } else {
      this.controls.target.lerp(this.target, Math.min(1, dt * 5));
      this.controls.update();
    }
    if (this.mode !== 'FREE ORBIT') {
      this.controls.target.copy(this.target);
      this.controls.update();
    }
  }

  public focus(position: Vector3): void {
    this.camera.position.set(position.x + 8, 6.4, position.z + 9);
    this.controls.target.copy(position);
  }

  public victoryShot(position: Vector3, dt: number): void {
    this.controls.enabled = false;
    const desired = new Vector3(position.x + 14, 11, position.z + 16);
    this.camera.position.lerp(desired, Math.min(1, dt * 1.6));
    this.controls.target.lerp(position, Math.min(1, dt * 2));
    this.camera.lookAt(this.controls.target);
  }
}
