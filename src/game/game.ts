import { Scene, Vector3 } from 'three';
import { AudioSynth } from '../core/audio.ts';
import { clamp } from '../core/rng.ts';
import { FlyBrain, type MotorCommand } from '../brain/fly-brain.ts';
import { readSensors, type SensorEntity } from './sensors.ts';
import { sphereSphere } from './collisions.ts';
import { Arena } from './arena.ts';
import { Enemies } from './enemies.ts';
import { Fly } from './fly.ts';
import { Hazards } from './hazards.ts';
import {
  ArenaStateMachine,
  type ArenaState,
} from './state-machine.ts';

export type GameState = ArenaState;

export interface GameEvent {
  type: 'fire' | 'hit' | 'explosion' | 'food' | 'damage' | 'wave' | 'gameover';
  value?: number;
}

export interface GameSnapshot {
  state: GameState;
  score: number;
  survival: number;
  wave: number;
  kills: number;
  lives: number;
  health: number;
  command: MotorCommand;
  event?: GameEvent;
}

export class Game {
  public state: GameState = 'title';
  public paused = false;
  public manualOverride = false;
  public simulationSpeed = 1;
  public score = 0;
  public survival = 0;
  public wave = 0;
  public kills = 0;
  public readonly fly: Fly;
  public readonly enemies: Enemies;
  public readonly hazards: Hazards;
  public readonly brain: FlyBrain;
  public readonly audio = new AudioSynth();
  public readonly sequence: ArenaStateMachine;
  public lastEvent: GameEvent | undefined;
  public victoryCaption = '';
  private readonly debugWin: boolean;
  private waveKills = 0;
  private fireCooldown = 0;
  private waveDelay = 0;
  private readonly keys = new Set<string>();

  public constructor(
    public readonly arena: Arena,
    brain: FlyBrain,
    options: { debugWin?: boolean } = {},
  ) {
    this.brain = brain;
    this.debugWin = options.debugWin ?? false;
    this.fly = new Fly(arena.scene);
    this.enemies = new Enemies(arena.scene, arena.rng.fork(0x334455));
    this.hazards = new Hazards(arena.scene, arena.rng.fork(0x778899), arena.radius);
    this.sequence = new ArenaStateMachine({
      eliminate: (target) => {
        this.enemies.eliminate(target.id);
        this.audio.explosion();
      },
      onState: (state) => {
        this.state = state;
        this.paused = state === 'paused';
      },
    });
    this.installInput();
  }

  private installInput(): void {
    if (typeof window === 'undefined') {
      return;
    }
    window.addEventListener('keydown', (event) => {
      this.keys.add(event.key.toLowerCase());
      if (event.key.toLowerCase() === 'p') {
        this.togglePause();
      }
      if (event.key.toLowerCase() === 't') {
        this.manualOverride = !this.manualOverride;
      }
      if (event.key === '[') {
        this.simulationSpeed = clamp(this.simulationSpeed - 0.5, 0.5, 4);
      }
      if (event.key === ']') {
        this.simulationSpeed = clamp(this.simulationSpeed + 0.5, 0.5, 4);
      }
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.key.toLowerCase()));
  }

  public start(): void {
    if (this.state === 'gameover') {
      this.reset();
    }
    this.sequence.start();
    this.state = 'playing';
    this.paused = false;
    if (this.wave === 0) {
      this.wave = 1;
      this.waveKills = 0;
      this.enemies.spawnWave(this.wave, this.arena.radius);
      this.emit({ type: 'wave', value: this.wave });
    }
  }

  public togglePause(): void {
    if (this.state === 'playing') this.sequence.pause();
    else if (this.state === 'paused') this.sequence.resume();
  }

  public reset(): void {
    this.sequence.reset();
    this.state = 'title';
    this.paused = false;
    this.score = 0;
    this.survival = 0;
    this.wave = 0;
    this.kills = 0;
    this.fireCooldown = 0;
    this.waveDelay = 0;
    this.waveKills = 0;
    this.victoryCaption = '';
    this.fly.reset();
    this.brain.reset();
    this.arena.resetFood();
    this.enemies.reset();
    this.hazards.reset();
    this.lastEvent = undefined;
  }

  public fixedStep(dt: number): void {
    if (this.state === 'spectate' || this.state === 'elimination') {
      this.fly.position.lerp(new Vector3(0, 1.8, 0), Math.min(1, dt * 2.4));
      this.fly.speed = 0;
      this.enemies.update(dt, this.fly.position, this.arena.radius);
      this.sequence.update(dt);
      this.victoryCaption = this.sequence.caption;
      return;
    }
    if (this.state === 'victory' || this.state === 'gameover' || this.state === 'title') {
      return;
    }
    if (this.state !== 'playing' || this.paused) {
      return;
    }
    this.sequence.update(dt);
    this.lastEvent = undefined;
    this.survival += dt;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.waveDelay = Math.max(0, this.waveDelay - dt);
    this.arena.update(dt);
    this.hazards.update(dt);
    const entities = this.sensorEntities();
    const readings = readSensors({
      flyX: this.fly.position.x,
      flyZ: this.fly.position.z,
      heading: this.fly.heading,
      arenaRadius: this.arena.radius,
      entities,
    });
    const command = this.brain.step(
      readings,
      { heading: this.fly.heading, steps: 16 },
      dt,
    );
    const manualTurn = this.readManualTurn();
    const manualThrust = this.readManualThrust();
    const flyResult = this.fly.update(
      dt,
      command,
      this.arena.radius,
      this.arena.obstacles,
      this.manualOverride ? manualTurn : 0,
      this.manualOverride ? manualThrust : undefined,
    );
    if (flyResult.damage > 0 && (flyResult.wallHit || flyResult.obstacleHit)) {
      this.damage(flyResult.damage * dt * 3);
    }
    const hazard = this.hazards.collides(this.fly.position);
    if (hazard) {
      this.damage(hazard.damage * dt * 2.2);
    }
    this.enemies.update(dt, this.fly.position, this.arena.radius);
    this.handleEnemyCollision();
    this.handleIncomingProjectile();
    this.handleFlyProjectileHits();
    this.handleFood();
    this.handleFiring(command);
    this.handleWave();
    if (this.debugWin && this.survival > 1 && this.wave === 1) {
      this.beginVictory();
    }
  }

  private readManualTurn(): number {
    return Number(this.keys.has('arrowright') || this.keys.has('d')) -
      Number(this.keys.has('arrowleft') || this.keys.has('a'));
  }

  private readManualThrust(): number {
    return clamp(
      0.55 +
      Number(this.keys.has('arrowup') || this.keys.has('w')) * 0.35 -
      Number(this.keys.has('arrowdown') || this.keys.has('s')) * 0.3,
      0,
      1,
    );
  }

  private handleFiring(command: MotorCommand): void {
    if (!command.fire || this.fireCooldown > 0) {
      return;
    }
    const direction = this.fly.forwardVector();
    this.enemies.projectiles.fire(this.fly.muzzle, direction, {
      owner: 'fly',
      damage: 1,
      speed: 19,
      radius: 0.13,
      lifetime: 2.4,
      color: 0x4ff6ff,
    });
    this.fireCooldown = 0.16;
    this.audio.blip(520, 0.045, 'square');
    this.emit({ type: 'fire' });
    const target = this.findEnemyInBulletPath(direction);
    if (target) {
      const hit = this.enemies.hit(target.group.position, target.radius, 1);
      if (hit) {
        this.score += 100;
        if (!target.active) {
          this.recordKill();
          this.score += this.wave * 25;
          this.emit({ type: 'explosion', value: this.score });
        } else {
          this.emit({ type: 'hit' });
        }
        this.audio.blip(target.active ? 180 : 90, target.active ? 0.06 : 0.13, 'sawtooth');
      }
    }
  }

  private findEnemyInBulletPath(direction: Vector3): { group: { position: Vector3 }; radius: number; active: boolean } | undefined {
    let closest: { group: { position: Vector3 }; radius: number; active: boolean } | undefined;
    let best = 999;
    for (const enemy of this.enemies.items) {
      if (!enemy.active) {
        continue;
      }
      const offset = enemy.group.position.clone().sub(this.fly.muzzle);
      const forwardDistance = offset.dot(direction);
      if (forwardDistance < 0 || forwardDistance > 20) {
        continue;
      }
      const lateral = offset.clone().addScaledVector(direction, -forwardDistance).length();
      if (lateral < enemy.radius + 0.3 && forwardDistance < best) {
        best = forwardDistance;
        closest = enemy;
      }
    }
    return closest;
  }

  private handleEnemyCollision(): void {
    for (const enemy of this.enemies.items) {
      if (enemy.active && sphereSphere(enemy.group.position, enemy.radius, this.fly.position, this.fly.radius)) {
        this.damage(enemy.kind === 'wasp' ? 25 : 14);
      }
    }
  }

  private handleIncomingProjectile(): void {
    const projectile = this.enemies.projectiles.hitSphere(this.fly.position, this.fly.radius, 'enemy');
    if (projectile) {
      this.enemies.projectiles.consume(projectile);
      this.damage(projectile.damage);
    }
  }

  private handleFlyProjectileHits(): void {
    for (const projectile of this.enemies.projectiles.items) {
      if (!projectile.active || projectile.owner !== 'fly') {
        continue;
      }
      const enemy = this.enemies.hit(projectile.mesh.position, projectile.radius, projectile.damage);
      if (!enemy) {
        continue;
      }
      this.enemies.projectiles.consume(projectile);
      this.emit({ type: enemy.active ? 'hit' : 'explosion' });
      if (!enemy.active) {
        this.recordKill();
        this.score += 100 + this.wave * 25;
      }
    }
  }

  private damage(amount: number): void {
    const gameover = this.fly.takeDamage(amount);
    this.emit({ type: 'damage', value: amount });
    this.audio.blip(110, 0.08, 'sawtooth');
    if (gameover) {
      this.sequence.gameover();
      this.paused = false;
      this.emit({ type: 'gameover', value: this.score });
    }
  }

  private handleFood(): void {
    for (const food of this.arena.foods) {
      if (!food.active) {
        continue;
      }
      const distance = Math.hypot(this.fly.position.x - food.x, this.fly.position.z - food.z);
      if (distance < food.radius + this.fly.radius) {
        this.arena.collectFood(food.id);
        this.fly.heal(28);
        this.score += 75;
        this.emit({ type: 'food', value: 75 });
        this.audio.blip(740, 0.16, 'sine');
      }
    }
  }

  private handleWave(): void {
    if (this.enemies.remaining() !== 0 || this.waveDelay > 0) {
      return;
    }
    this.waveDelay = 1.2;
    if (this.wave >= 5) {
      this.beginVictory();
      return;
    }
    this.wave += 1;
    this.waveKills = 0;
    this.score += this.wave * 200;
    this.emit({ type: 'wave', value: this.wave });
    this.enemies.spawnWave(this.wave, this.arena.radius);
  }

  private recordKill(): void {
    this.kills += 1;
    this.waveKills += 1;
  }

  private beginVictory(): void {
    const targets = this.enemies.items
      .filter((enemy) => enemy.active)
      .map((enemy) => ({ id: enemy.id }));
    this.sequence.beginVictory(
      {
        score: this.score,
        waves: this.wave,
        kills: this.kills,
        survival: this.survival,
      },
      targets,
    );
    this.victoryCaption = this.sequence.caption;
  }

  public skipVictorySequence(): void {
    this.sequence.skip();
    this.victoryCaption = this.sequence.caption;
  }

  public debugVictory(): void {
    if (this.state === 'title') this.start();
    this.wave = Math.max(this.wave, 5);
    this.beginVictory();
    this.skipVictorySequence();
  }

  private sensorEntities(): SensorEntity[] {
    const entities: SensorEntity[] = [];
    for (const obstacle of this.arena.obstacleEntities()) {
      entities.push({ ...obstacle, kind: 'obstacle' });
    }
    for (const hazard of this.hazards.entities()) {
      entities.push(hazard);
    }
    entities.push(...this.enemies.activeEntities());
    entities.push(...this.enemies.projectileEntities());
    for (const food of this.arena.foods) {
      if (food.active) {
        entities.push({ x: food.x, z: food.z, radius: food.radius, kind: 'food' });
      }
    }
    return entities;
  }

  private emit(event: GameEvent): void {
    this.lastEvent = event;
  }

  public consumeEvent(): GameEvent | undefined {
    const event = this.lastEvent;
    this.lastEvent = undefined;
    return event;
  }

  public snapshot(): GameSnapshot {
    return {
      state: this.state,
      score: this.score,
      survival: this.survival,
      wave: this.wave,
      kills: this.kills,
      lives: this.fly.lives,
      health: this.fly.health,
      command: this.brain.command,
      event: this.lastEvent,
    };
  }

  public renderScene(): Scene {
    return this.arena.scene;
  }
}
