/**
 * Pure-math steering behaviours on the XZ plane.
 *
 * No three.js imports so the module is unit-testable in Node. All forces are
 * accelerations (units/s^2) applied through `integrate`, which clamps to the
 * agent's maxForce/maxSpeed and is frame-rate independent.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export interface SteeringAgent {
  position: Vec2;
  velocity: Vec2;
  maxSpeed: number;
  maxForce: number;
}

export interface WanderState {
  angle: number;
}

const WANDER_CIRCLE_DISTANCE = 1.6;
const WANDER_CIRCLE_RADIUS = 1.1;
const WANDER_JITTER = 3;

function length(v: Vec2): number {
  return Math.hypot(v.x, v.z);
}

function normalize(v: Vec2): Vec2 {
  const len = length(v);
  if (len < 1e-6) {
    return { x: 0, z: 0 };
  }
  return { x: v.x / len, z: v.z / len };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z };
}

export function scale(v: Vec2, factor: number): Vec2 {
  return { x: v.x * factor, z: v.z * factor };
}

export function limit(v: Vec2, max: number): Vec2 {
  const len = length(v);
  if (len <= max || len < 1e-6) {
    return { x: v.x, z: v.z };
  }
  const scale = max / len;
  return { x: v.x * scale, z: v.z * scale };
}

export function seek(agent: SteeringAgent, target: Vec2, slowRadius = 0): Vec2 {
  const offset = { x: target.x - agent.position.x, z: target.z - agent.position.z };
  const distance = length(offset);
  if (distance < 1e-6) {
    return { x: -agent.velocity.x, z: -agent.velocity.z };
  }
  const speed = slowRadius > 0 && distance < slowRadius
    ? agent.maxSpeed * (distance / slowRadius)
    : agent.maxSpeed;
  const desired = { x: (offset.x / distance) * speed, z: (offset.z / distance) * speed };
  return { x: desired.x - agent.velocity.x, z: desired.z - agent.velocity.z };
}

export function flee(agent: SteeringAgent, threat: Vec2): Vec2 {
  const offset = { x: agent.position.x - threat.x, z: agent.position.z - threat.z };
  const direction = normalize(offset);
  const desired = { x: direction.x * agent.maxSpeed, z: direction.z * agent.maxSpeed };
  return { x: desired.x - agent.velocity.x, z: desired.z - agent.velocity.z };
}

export function pursue(
  agent: SteeringAgent,
  target: Vec2,
  targetVelocity: Vec2,
  maxPrediction = 1.2,
): Vec2 {
  const distance = length({ x: target.x - agent.position.x, z: target.z - agent.position.z });
  const prediction = Math.min(maxPrediction, distance / Math.max(0.001, agent.maxSpeed));
  const predicted = {
    x: target.x + targetVelocity.x * prediction,
    z: target.z + targetVelocity.z * prediction,
  };
  return seek(agent, predicted);
}

export function wander(
  agent: SteeringAgent,
  state: WanderState,
  dt: number,
  rng: () => number,
): Vec2 {
  // sqrt(dt) scaling keeps the angular diffusion statistically identical at
  // any update rate (30 Hz accumulates the same variance per second as 60 Hz).
  state.angle += (rng() * 2 - 1) * WANDER_JITTER * Math.sqrt(dt);
  const forward = Math.abs(agent.velocity.x) + Math.abs(agent.velocity.z) > 1e-4
    ? normalize(agent.velocity)
    : { x: Math.sin(state.angle), z: Math.cos(state.angle) };
  const circleCenter = {
    x: forward.x * WANDER_CIRCLE_DISTANCE,
    z: forward.z * WANDER_CIRCLE_DISTANCE,
  };
  const displacement = {
    x: Math.sin(state.angle) * WANDER_CIRCLE_RADIUS,
    z: Math.cos(state.angle) * WANDER_CIRCLE_RADIUS,
  };
  const force = {
    x: (circleCenter.x + displacement.x) * agent.maxForce * 0.7,
    z: (circleCenter.z + displacement.z) * agent.maxForce * 0.7,
  };
  return limit(force, agent.maxForce);
}

export function separation(
  agent: SteeringAgent,
  neighbors: readonly Vec2[],
  radius: number,
): Vec2 {
  // Returns the inverse-distance-weighted direction TOWARD the crowd —
  // callers apply it with a negative weight to push the agent away.
  const force = { x: 0, z: 0 };
  for (const neighbor of neighbors) {
    const dx = neighbor.x - agent.position.x;
    const dz = neighbor.z - agent.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-4 || distance > radius) {
      continue;
    }
    const weight = 1 / distance;
    force.x += (dx / distance) * weight;
    force.z += (dz / distance) * weight;
  }
  if (force.x === 0 && force.z === 0) {
    return force;
  }
  // Magnitude stays inverse-distance weighted: close neighbours saturate
  // at maxForce, distant ones contribute proportionally less.
  return limit(
    { x: force.x * agent.maxForce, z: force.z * agent.maxForce },
    agent.maxForce,
  );
}

export function cohesion(agent: SteeringAgent, neighbors: readonly Vec2[]): Vec2 {
  if (neighbors.length === 0) {
    return { x: 0, z: 0 };
  }
  const center = { x: 0, z: 0 };
  for (const neighbor of neighbors) {
    center.x += neighbor.x;
    center.z += neighbor.z;
  }
  center.x /= neighbors.length;
  center.z /= neighbors.length;
  return seek(agent, center);
}

export function alignment(
  agent: SteeringAgent,
  neighborVelocities: readonly Vec2[],
): Vec2 {
  if (neighborVelocities.length === 0) {
    return { x: 0, z: 0 };
  }
  const average = { x: 0, z: 0 };
  for (const velocity of neighborVelocities) {
    average.x += velocity.x;
    average.z += velocity.z;
  }
  average.x /= neighborVelocities.length;
  average.z /= neighborVelocities.length;
  return { x: average.x - agent.velocity.x, z: average.z - agent.velocity.z };
}

export function containWithinCircle(
  agent: SteeringAgent,
  arenaRadius: number,
  margin: number,
): Vec2 {
  const distance = length(agent.position);
  const freeRadius = Math.max(0, arenaRadius - margin);
  if (distance <= freeRadius) {
    return { x: 0, z: 0 };
  }
  const over = Math.min(1, (distance - freeRadius) / Math.max(0.001, margin));
  const inward = distance > 1e-6
    ? { x: -agent.position.x / distance, z: -agent.position.z / distance }
    : { x: 0, z: -1 };
  // Smooth ramp from 0 at (R - margin) up to a dominant push at the wall,
  // plus cancelling any remaining outward velocity so wall-slides stop.
  const strength = agent.maxForce * (0.5 + 1.5 * over * over);
  const outwardSpeed = agent.velocity.x * -inward.x + agent.velocity.z * -inward.z;
  return {
    x: inward.x * strength - inward.x * Math.max(0, outwardSpeed) * 2,
    z: inward.z * strength - inward.z * Math.max(0, outwardSpeed) * 2,
  };
}

export function avoidCircles(
  agent: SteeringAgent,
  obstacles: readonly { x: number; z: number; radius: number }[],
  lookAhead: number,
): Vec2 {
  const speed = length(agent.velocity);
  if (speed < 1e-4) {
    return { x: 0, z: 0 };
  }
  const ahead = {
    x: agent.position.x + (agent.velocity.x / speed) * lookAhead,
    z: agent.position.z + (agent.velocity.z / speed) * lookAhead,
  };
  const force = { x: 0, z: 0 };
  for (const obstacle of obstacles) {
    const dx = ahead.x - obstacle.x;
    const dz = ahead.z - obstacle.z;
    const distance = Math.hypot(dx, dz);
    const combined = obstacle.radius + 0.5;
    if (distance >= combined || distance < 1e-4) {
      continue;
    }
    const push = (combined - distance) / combined;
    force.x += (dx / distance) * push;
    force.z += (dz / distance) * push;
  }
  if (force.x === 0 && force.z === 0) {
    return force;
  }
  // Head-on symmetry break: an obstacle dead ahead produces a force that is
  // anti-parallel to the velocity, which brakes instead of steering aside.
  // When the summed force points nearly straight back, add a strong fixed
  // tangential term so the agent commits to a deterministic dodge direction.
  const forward = { x: agent.velocity.x / speed, z: agent.velocity.z / speed };
  const magnitude = length(force);
  const headOn = -(force.x * forward.x + force.z * forward.z) / magnitude;
  if (headOn > 0.8) {
    const perpendicular = { x: -force.z / magnitude, z: force.x / magnitude };
    force.x += perpendicular.x * magnitude;
    force.z += perpendicular.z * magnitude;
  }
  const direction = normalize(force);
  return { x: direction.x * agent.maxForce, z: direction.z * agent.maxForce };
}

export function integrate(
  agent: SteeringAgent,
  force: Vec2,
  dt: number,
  damping = 0,
): void {
  const applied = limit(force, agent.maxForce);
  agent.velocity.x += applied.x * dt;
  agent.velocity.z += applied.z * dt;
  if (damping > 0) {
    const decay = Math.exp(-damping * dt);
    agent.velocity.x *= decay;
    agent.velocity.z *= decay;
  }
  const capped = limit(agent.velocity, agent.maxSpeed);
  agent.velocity.x = capped.x;
  agent.velocity.z = capped.z;
  agent.position.x += agent.velocity.x * dt;
  agent.position.z += agent.velocity.z * dt;
}

export function headingOf(v: Vec2, fallback: number): number {
  if (Math.abs(v.x) + Math.abs(v.z) < 1e-4) {
    return fallback;
  }
  return Math.atan2(v.x, v.z);
}

export function turnToward(current: number, target: number, maxDelta: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + Math.max(-maxDelta, Math.min(maxDelta, delta));
}
