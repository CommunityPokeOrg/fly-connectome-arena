import { Vector3 } from 'three';

export interface CircleBody {
  x: number;
  z: number;
  radius: number;
}

export function sphereSphere(first: Vector3, firstRadius: number, second: Vector3, secondRadius: number): boolean {
  const combined = firstRadius + secondRadius;
  return first.distanceToSquared(second) <= combined * combined;
}

export function circleCircle(first: CircleBody, second: CircleBody): boolean {
  const dx = first.x - second.x;
  const dz = first.z - second.z;
  const combined = first.radius + second.radius;
  return dx * dx + dz * dz <= combined * combined;
}

export function sphereWall(position: Vector3, radius: number, arenaRadius: number): Vector3 {
  const limit = Math.max(0, arenaRadius - radius);
  const distance = Math.hypot(position.x, position.z);
  if (distance <= limit) {
    return position.clone();
  }
  const scale = limit / Math.max(0.0001, distance);
  return new Vector3(position.x * scale, position.y, position.z * scale);
}

export function wallNormal(position: Vector3): Vector3 {
  const length = Math.hypot(position.x, position.z);
  if (length < 0.0001) {
    return new Vector3(0, 0, 1);
  }
  return new Vector3(position.x / length, 0, position.z / length);
}

export function resolveSphereAgainstCircle(position: Vector3, radius: number, obstacle: CircleBody): { position: Vector3; normal: Vector3; penetration: number } | undefined {
  const dx = position.x - obstacle.x;
  const dz = position.z - obstacle.z;
  const distance = Math.hypot(dx, dz);
  const combined = radius + obstacle.radius;
  if (distance >= combined) {
    return undefined;
  }
  const safeDistance = Math.max(0.0001, distance);
  const normal = new Vector3(dx / safeDistance, 0, dz / safeDistance);
  return {
    position: new Vector3(obstacle.x + normal.x * combined, position.y, obstacle.z + normal.z * combined),
    normal,
    penetration: combined - distance,
  };
}

export function segmentCircleHit(startX: number, startZ: number, endX: number, endZ: number, circle: CircleBody): boolean {
  const vx = endX - startX;
  const vz = endZ - startZ;
  const wx = circle.x - startX;
  const wz = circle.z - startZ;
  const lengthSquared = vx * vx + vz * vz;
  const projection = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wz * vz) / lengthSquared));
  const closestX = startX + vx * projection;
  const closestZ = startZ + vz * projection;
  const dx = closestX - circle.x;
  const dz = closestZ - circle.z;
  return dx * dx + dz * dz <= circle.radius * circle.radius;
}

export function clampToArena(position: Vector3, radius: number, arenaRadius: number): { position: Vector3; collided: boolean; normal: Vector3 } {
  const bounded = sphereWall(position, radius, arenaRadius);
  const collided = !bounded.equals(position);
  return { position: bounded, collided, normal: collided ? wallNormal(position) : new Vector3() };
}
