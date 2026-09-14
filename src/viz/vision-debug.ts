import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  Scene,
} from 'three';
import type { VisionFrame } from '../game/vision.ts';

export class VisionDebug {
  private readonly geometry: BufferGeometry;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly lines: LineSegments;

  public constructor(scene: Scene) {
    this.geometry = new BufferGeometry();
    this.positions = new Float32Array(24 * 2 * 3);
    this.colors = new Float32Array(24 * 2 * 3);
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
    this.lines = new LineSegments(
      this.geometry,
      new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 }),
    );
    this.lines.visible = false;
    scene.add(this.lines);
  }

  public update(fly: { x: number; z: number; heading: number }, frame: VisionFrame): void {
    const colorFor = (hit: VisionFrame['rays'][number]['hit']): Color => {
      switch (hit) {
        case 'wall': return new Color(0x9a8f7a);
        case 'obstacle': return new Color(0xc0a060);
        case 'enemy': return new Color(0xa65b4b);
        default: return new Color(0x6b7280);
      }
    };
    for (let index = 0; index < 24; index += 1) {
      const ray = frame.rays[index];
      if (!ray) continue;
      const offset = index * 6;
      const worldAngle = fly.heading + ray.angle;
      const dx = Math.sin(worldAngle) * ray.distance;
      const dz = Math.cos(worldAngle) * ray.distance;
      this.positions[offset] = fly.x;
      this.positions[offset + 1] = 0.6;
      this.positions[offset + 2] = fly.z;
      this.positions[offset + 3] = fly.x + dx;
      this.positions[offset + 4] = 0.6;
      this.positions[offset + 5] = fly.z + dz;
      const color = colorFor(ray.hit);
      const intensity = 0.35 + (frame.intensity[index] ?? 0) * 0.65;
      for (let vertex = 0; vertex < 2; vertex += 1) {
        this.colors[offset + vertex * 3] = color.r * intensity;
        this.colors[offset + vertex * 3 + 1] = color.g * intensity;
        this.colors[offset + vertex * 3 + 2] = color.b * intensity;
      }
    }
    (this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
  }

  public setVisible(visible: boolean): void {
    this.lines.visible = visible;
  }
}
