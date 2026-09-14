import type { Game } from '../game/game.ts';
import type { GameCamera } from '../game/camera.ts';
import type { ConnectomeVisualizer } from '../viz/connectome-viz.ts';

export class HUD {
  public readonly root = document.createElement('div');
  private score!: HTMLElement;
  private wave!: HTMLElement;
  private lives!: HTMLElement;
  private healthFill!: HTMLElement;
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
    header.innerHTML = `<div class="brand">FLY<span>//</span>CONNECTOME <small>ARENA</small></div>`;
    const telemetry = document.createElement('div');
    telemetry.className = 'telemetry';
    telemetry.innerHTML = `<span>SEED <b>${String(this.seed)}</b></span><span>CAM <b class="camera-value">ORBIT FOLLOW</b></span><span>FPS <b class="fps-value">60</b></span>`;
    this.cameraLabel = telemetry.querySelector('.camera-value') as HTMLSpanElement;
    header.append(telemetry);
    this.root.append(header);
  }

  private buildStats(): void {
    const stats = document.createElement('section');
    stats.className = 'stats-grid';
    stats.innerHTML = `
      <div class="stat-card"><label>SCORE</label><strong class="score-value">000000</strong></div>
      <div class="stat-card"><label>WAVE</label><strong class="wave-value">00</strong></div>
      <div class="stat-card"><label>LIVES</label><strong class="lives-value">♥♥♥</strong></div>
      <div class="stat-card health-card"><label>HULL INTEGRITY</label><div class="health-track"><span></span></div></div>
      <div class="stat-card status-card"><label>STATUS</label><span class="status-value">SYSTEM READY</span></div>`;
    this.root.append(stats);
    this.score = stats.querySelector('.score-value') as HTMLElement;
    this.wave = stats.querySelector('.wave-value') as HTMLElement;
    this.lives = stats.querySelector('.lives-value') as HTMLElement;
    this.healthFill = stats.querySelector('.health-track span') as HTMLSpanElement;
    this.status = stats.querySelector('.status-value') as HTMLSpanElement;
  }

  private buildControls(): void {
    const controls = document.createElement('nav');
    controls.className = 'control-bar';
    const buttons: Array<[string, string, () => void]> = [
      ['START', 'Start simulation', this.onStart],
      ['CAMERA', 'Cycle camera mode', () => this.setCamera(this.camera.cycle())],
      ['VIS', 'Toggle visualizer', () => this.visualizer.element.classList.toggle('collapsed')],
      ['MUTE', 'Toggle synthesized audio', () => this.toggleMute()],
      ['RESET', 'Reset with current seed', this.onRestart],
      ['MAP', 'Cycle arena environment', () => {
        this.status.textContent = `MAP // ${this.onMapChange()}`;
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
        <p class="eyebrow">DETERMINISTIC NEURAL COMBAT // BUILD 01</p>
        <h1>FLY <span>//</span> CONNECTOME ARENA</h1>
        <p class="subtitle">A simulated Drosophila navigates a neon arena using a connectome-inspired spiking brain.</p>
        <div class="instruction-grid">
          <span><b>SPACE</b> START / RESTART</span><span><b>P</b> PAUSE</span>
          <span><b>C</b> CAMERA</span><span><b>V</b> VISUALIZER</span>
          <span><b>M</b> MUTE</span><span><b>[ ]</b> SIM SPEED</span>
          <span><b>R</b> RESET</span><span><b>T</b> MANUAL OVERRIDE</span>
          <span><b>WASD / ARROWS</b> STEER MANUALLY</span>
        </div>
        <button class="primary-button" type="button">INITIALIZE BRAIN</button>
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
      this.visualizer.element.classList.toggle('collapsed');
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
    this.lives.textContent = '♥'.repeat(Math.max(0, this.game.fly.lives));
    this.healthFill.style.width = `${this.game.fly.health}%`;
    const mode = this.game.manualOverride ? 'MANUAL OVERRIDE' : 'NEURAL CONTROL';
    const state = this.game.state === 'playing'
      ? `${this.game.paused ? 'PAUSED' : mode} // ${this.game.simulationSpeed.toFixed(1)}X${this.muted ? ' // MUTED' : ''}`
      : this.game.state.toUpperCase();
    this.status.textContent = state;
    const fpsNode = this.root.querySelector('.fps-value');
    if (fpsNode) fpsNode.textContent = String(Math.round(fps));
    this.overlay.classList.toggle('hidden', this.game.state === 'playing' || this.game.state === 'paused');
    if (this.game.state === 'spectate' || this.game.state === 'elimination' || this.game.state === 'victory') {
      if (this.lastOverlayState !== this.game.state) {
        const card = this.overlay.querySelector('.title-card');
        if (card) {
          const caption = this.game.state === 'victory'
            ? `<p class="eyebrow">ARENA SECURED // FINAL REPORT</p><h1>VICTORY</h1><p class="subtitle">Score ${Math.floor(this.game.score)} // Waves ${this.game.wave} // Kills ${this.game.kills} // Time ${this.game.survival.toFixed(1)}s</p><button class="primary-button" type="button">RESTART RUN</button>`
            : `<p class="eyebrow">${this.game.state === 'spectate' ? 'SPECTATOR LOCK // NEURAL CONTROL SUSPENDED' : 'ORBITAL PURGE PROTOCOL'}</p><h1>${this.game.victoryCaption || 'VICTORY APPROACH'}</h1><p class="subtitle">SPACE / ENTER / CLICK TO SKIP SEQUENCE</p>`;
          card.innerHTML = caption;
          const button = card.querySelector('button');
          if (button) button.addEventListener('click', this.onRestart);
        }
        this.lastOverlayState = this.game.state;
      }
      if (this.game.state === 'elimination') {
        const heading = this.overlay.querySelector('h1');
        if (heading) heading.textContent = this.game.victoryCaption || 'PURGING SWARM';
      }
    }
    if (this.game.state === 'gameover') {
      const card = this.overlay.querySelector('.title-card');
      if (card) {
        card.innerHTML = `<p class="eyebrow">SIGNAL LOST // RUN TERMINATED</p><h1>HIVE MIND OFFLINE</h1><p class="subtitle">Score ${Math.floor(this.game.score)} // Wave ${this.game.wave} // ${this.game.kills} targets neutralized</p><button class="primary-button" type="button">REBOOT SYSTEM</button>`;
        (card.querySelector('button') as HTMLButtonElement).onclick = this.onRestart;
      }
    }
  }
}
