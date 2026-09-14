export type ArenaState = 'title' | 'playing' | 'spectate' | 'elimination' | 'victory' | 'gameover' | 'paused';

export interface VictoryTallies {
  score: number;
  waves: number;
  kills: number;
  survival: number;
}

export interface EliminationTarget {
  id: string;
}

export interface StateMachineCallbacks {
  eliminate?: (target: EliminationTarget) => void;
  onState?: (state: ArenaState) => void;
}

export class ArenaStateMachine {
  public state: ArenaState = 'title';
  public caption = '';
  public tallies: VictoryTallies = { score: 0, waves: 0, kills: 0, survival: 0 };
  public targets: EliminationTarget[] = [];
  public eliminated = 0;
  private spectateTime = 0;
  private eliminationTime = 0;
  private lastTargetIndex = 0;
  private survivorBeat = 0;
  private readonly callbacks: StateMachineCallbacks;

  public constructor(callbacks: StateMachineCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public start(): void {
    this.transition('playing');
  }

  public reset(): void {
    this.state = 'title';
    this.caption = '';
    this.targets = [];
    this.eliminated = 0;
    this.spectateTime = 0;
    this.eliminationTime = 0;
    this.survivorBeat = 0;
  }

  public pause(): void {
    if (this.state === 'playing') this.transition('paused');
  }

  public resume(): void {
    if (this.state === 'paused') this.transition('playing');
  }

  public gameover(): void {
    if (this.state === 'playing' || this.state === 'paused') this.transition('gameover');
  }

  public beginVictory(tallies: VictoryTallies, targets: EliminationTarget[]): void {
    if (this.state !== 'playing') return;
    this.tallies = { ...tallies };
    this.targets = [...targets];
    this.eliminated = 0;
    this.lastTargetIndex = 0;
    this.spectateTime = 0;
    this.survivorBeat = targets.length === 0 ? 2 : 0;
    this.caption = targets.length === 0 ? 'LAST SURVIVOR' : 'VICTORY APPROACH';
    this.transition('spectate');
  }

  public update(dt: number): void {
    if (this.state === 'spectate') {
      this.spectateTime += dt;
      if (this.spectateTime >= 1.5) this.beginElimination();
    } else if (this.state === 'elimination') {
      this.eliminationTime += dt;
      if (this.targets.length === 0) {
        this.survivorBeat -= dt;
        if (this.survivorBeat <= 0) this.transition('victory');
      } else if (this.eliminationTime >= 1.2) {
        this.eliminationTime = 0;
        const target = this.targets[this.lastTargetIndex];
        if (target) {
          this.lastTargetIndex += 1;
          this.eliminated += 1;
          this.caption = `PURGING SWARM  ${this.eliminated}/${this.targets.length}`;
          this.callbacks.eliminate?.(target);
        }
        if (this.eliminated >= this.targets.length) this.transition('victory');
      }
    }
  }

  public skip(): void {
    if (this.state !== 'spectate' && this.state !== 'elimination') return;
    for (const target of this.targets.slice(this.eliminated)) {
      this.callbacks.eliminate?.(target);
    }
    this.eliminated = this.targets.length;
    this.transition('victory');
  }

  private beginElimination(): void {
    this.eliminationTime = 0;
    this.caption = this.targets.length === 0 ? 'LAST SURVIVOR' : `PURGING SWARM  0/${this.targets.length}`;
    this.transition('elimination');
  }

  private transition(state: ArenaState): void {
    this.state = state;
    this.callbacks.onState?.(state);
  }
}
