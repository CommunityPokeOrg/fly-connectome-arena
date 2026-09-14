import type { Game } from '../game/game.ts';
import type { GameCamera } from '../game/camera.ts';
import type { ConnectomeVisualizer } from '../viz/connectome-viz.ts';

export class HUD {
  public readonly root = document.createElement('div');
  private score!: HTMLElement;
  private wave!: HTMLElement;
  private lives!: HTMLElement;
  private healthFill!: HTMLElement;
  private healthValue!: HTMLElement;
  private status!: HTMLElement;
  private cameraLabel!: HTMLElement;
  private readonly overlay = document.createElement('section');
  private muted = false;
  private lastOverlayState = 'title';

  public constructor(
    private readonly game: Game,
    private readonly camera: GameCamera,
    private readonly visualizer: ConnectomeVisualizer,
    private readonly seed: number | string,
    private readonly onStart: () => void,
    private readonly onRestart: () => void,
    private readonly onMapChange: () => string = () => 'UNKNOWN',
  ) {
    this.root.className = 'hud-layer';
    this.buildHeader();
    this.buildStats();
    this.buildControls();
    this.buildOverlay();
    window.addEventListener('keydown', (event) => this.handleKey(event));
  }

  private buildHeader(): void {
    const header = document.createElement('header');
    header.className = 'top-bar';
    header.innerHTML = `<div class="brand">Fly Connectome Arena <small>Drosophila flight lab</small></div>`;
    const telemetry = document.createElement('div');
    telemetry.className = 'telemetry';
    telemetry.innerHTML = `<span>seed <b>${String(this.seed)}</b></span><span>camera <b class="camera-value">orbit follow</b></span><span>fps <b class="fps-value">60</b></span>`;
    this.cameraLabel = telemetry.querySelector('.camera-value') as HTMLSpanElement;
    header.append(telemetry);
    this.root.append(header);
  }

  private buildStats(): void {
    const stats = document.createElement('section');
    stats.className = 'stats-grid';
    stats.innerHTML = `
      <div class="stat-card"><label>Score</label><strong class="score-value">000000</strong></div>
      <div class="stat-card"><label>Wave</label><strong class="wave-value">00</strong></div>
      <div class="stat-card"><label>Lives</label><strong class="lives-value">●●●</strong></div>
      <div class="stat-card health-card"><label>Vitality</label><div class="health-track"><span></span></div><small class="health-value">100%</small></div>
      <div class="stat-card status-card"><label>Status</label><span class="status-value">Ready</span></div>`;
    this.root.append(stats);
    this.score = stats.querySelector('.score-value') as HTMLElement;
    this.wave = stats.querySelector('.wave-value') as HTMLElement;
    this.lives = stats.querySelector('.lives-value') as HTMLElement;
    this.healthFill = stats.querySelector('.health-track span') as HTMLSpanElement;
    this.status = stats.querySelector('.status-value') as HTMLSpanElement;
    this.healthValue = stats.querySelector('.health-value') as HTMLElement;
  }

  private buildControls(): void {
    const controls = document.createElement('nav');
    controls.className = 'control-bar';
    const buttons: Array<[string, string, () => void]> = [
      ['Start', 'Start simulation', this.onStart],
      ['Camera', 'Cycle camera mode', () => this.setCamera(this.camera.cycle())],
      ['Telemetry', 'Toggle connectome telemetry panel', () => this.toggleVisualizer()],
      ['Mute', 'Toggle synthesized audio', () => this.toggleMute()],
      ['Reset', 'Reset with current seed', this.onRestart],
      ['Arena', 'Cycle arena environment', () => {
        this.status.textContent = `Arena · ${this.onMapChange()}`;
      }],
    ];
    for (const [label, description, action] of buttons) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = description;
      button.setAttribute('aria-label', description);
      button.addEventListener('click', action);
      controls.append(button);
    }
    this.root.append(controls);
  }

  private buildOverlay(): void {
    this.overlay.className = 'screen-overlay';
    this.overlay.innerHTML = `
      <div class="title-card">
        <p class="eyebrow">Deterministic spiking-network flight simulation</p>
        <h1>Fly Connectome Arena</h1>
        <p class="subtitle">A simulated <em>Drosophila</em> forages and evades predators in a night garden, steered by a connectome-inspired leaky integrate-and-fire brain whose synapses adapt through dopamine and octopamine reinforcement.</p>
        <div class="instruction-grid">
          <span><b>Space</b> start / restart</span><span><b>P</b> pause</span>
          <span><b>C</b> camera</span><span><b>V</b> telemetry panel</span>
          <span><b>M</b> mute</span><span><b>[ ]</b> simulation speed</span>
          <span><b>R</b> reset</span><span><b>T</b> manual override</span>
          <span><b>WASD / arrows</b> steer manually</span>
        </div>
        <button class="primary-button" type="button">Begin simulation</button>
      </div>`;
    (this.overlay.querySelector('button') as HTMLButtonElement).addEventListener('click', this.onStart);
    this.overlay.addEventListener('click', () => {
      if (this.game.state === 'spectate' || this.game.state === 'elimination') {
        this.game.skipVictorySequence();
      }
    });
    this.root.append(this.overlay);
  }

  private handleKey(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (key === 'p') {
      this.game.togglePause();
    } else if (key === 'c') {
      this.setCamera(this.camera.cycle());
    } else if (key === 'v') {
      this.toggleVisualizer();
    } else if (key === 'm') {
      this.toggleMute();
    } else if (key === 'r') {
      this.onRestart();
    } else if (key === ' ') {
      event.preventDefault();
      if (this.game.state === 'spectate' || this.game.state === 'elimination') this.game.skipVictorySequence();
      else if (this.game.state === 'gameover' || this.game.state === 'victory') this.onRestart();
      else this.onStart();
    } else if (key === 'enter') {
      if (this.game.state === 'spectate' || this.game.state === 'elimination') this.game.skipVictorySequence();
    }
  }

  private toggleVisualizer(): void {
    this.visualizer.element.classList.toggle('collapsed');
    window.dispatchEvent(new Event('resize'));
  }

  private setCamera(mode: string): void {
    this.cameraLabel.textContent = mode;
  }

  private toggleMute(): void {
    this.muted = !this.muted;
    this.game.audio.muted = this.muted;
  }

  public update(fps: number): void {
    this.score.textContent = Math.floor(this.game.score).toString().padStart(6, '0');
    this.wave.textContent = this.game.wave.toString().padStart(2, '0');
    this.lives.textContent = '●'.repeat(Math.max(0, this.game.fly.lives)) || '—';
    const health = Math.max(0, Math.min(100, this.game.fly.health));
    this.healthFill.style.width = `${health}%`;
    this.healthFill.parentElement?.classList.toggle('low', health < 30);
    this.healthValue.textContent = `${Math.round(health)}%`;
    const mode = this.game.manualOverride ? 'Manual override' : 'Neural control';
    const state = this.game.state === 'playing'
      ? `${this.game.paused ? 'Paused' : mode} · ${this.game.simulationSpeed.toFixed(1)}×${this.muted ? ' · muted' : ''}`
      : this.game.state.charAt(0).toUpperCase() + this.game.state.slice(1);
    this.status.textContent = state;
    const fpsNode = this.root.querySelector('.fps-value');
    if (fpsNode) fpsNode.textContent = String(Math.round(fps));
    this.overlay.classList.toggle('hidden', this.game.state === 'playing' || this.game.state === 'paused');
    if (this.game.state === 'spectate' || this.game.state === 'elimination' || this.game.state === 'victory') {
      if (this.lastOverlayState !== this.game.state) {
        const card = this.overlay.querySelector('.title-card');
        if (card) {
          const caption = this.game.state === 'victory'
            ? `<p class="eyebrow">Session complete · final report</p><h1>Garden cleared</h1><p class="subtitle">Score ${Math.floor(this.game.score)} · waves ${this.game.wave} · predators repelled ${this.game.kills} · time ${this.game.survival.toFixed(1)} s</p><button class="primary-button" type="button">Restart run</button>`
            : `<p class="eyebrow">${this.game.state === 'spectate' ? 'Observation mode · neural control suspended' : 'Clearing the swarm'}</p><h1>${this.game.victoryCaption || 'Final approach'}</h1><p class="subtitle">Space / Enter / click to skip</p>`;
          card.innerHTML = caption;
          const button = card.querySelector('button');
          if (button) button.addEventListener('click', this.onRestart);
        }
        this.lastOverlayState = this.game.state;
      }
      if (this.game.state === 'elimination') {
        const heading = this.overlay.querySelector('h1');
        if (heading) heading.textContent = this.game.victoryCaption || 'Clearing the swarm';
      }
    }
    if (this.game.state === 'gameover') {
      const card = this.overlay.querySelector('.title-card');
      if (card) {
        card.innerHTML = `<p class="eyebrow">Run ended</p><h1>The fly did not survive</h1><p class="subtitle">Score ${Math.floor(this.game.score)} · wave ${this.game.wave} · ${this.game.kills} predators repelled</p><button class="primary-button" type="button">Restart run</button>`;
        (card.querySelector('button') as HTMLButtonElement).onclick = this.onRestart;
      }
    }
  }
}
