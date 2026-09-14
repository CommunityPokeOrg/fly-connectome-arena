import type { Population } from '../brain/connectome.ts';
import type { FlyBrain } from '../brain/fly-brain.ts';

interface Point {
  x: number;
  y: number;
}

const POPULATIONS: Population[] = [
  'ORN',
  'VIS',
  'TGT',
  'THR',
  'PN',
  'KC',
  'MBON',
  'CX',
  'LAL_L',
  'LAL_R',
  'DN',
];

export class ConnectomeVisualizer {
  public readonly element = document.createElement('aside');
  public readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private readonly tooltip = document.createElement('div');
  private readonly motorReadout = document.createElement('div');
  private readonly graphHeight = 390;
  private readonly rasterHeight = 116;
  private cssWidth = 362;
  private dpr = 1;
  private readonly spikeGlow = new Map<number, number>();

  public constructor(private readonly brain: FlyBrain) {
    this.element.className = 'viz-panel';
    this.element.setAttribute('aria-label', 'Live connectome visualizer');
    this.canvas.setAttribute('aria-label', 'Neural activity graph');
    this.tooltip.className = 'neuron-tooltip';
    this.motorReadout.className = 'motor-readout';
    this.element.append(this.canvas, this.tooltip, this.motorReadout);
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context unavailable');
    }
    this.context = context;
    this.canvas.addEventListener('pointermove', (event) => this.handlePointer(event));
    this.canvas.addEventListener('pointerleave', () => {
      this.tooltip.textContent = '';
    });
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    const width = this.element.clientWidth || this.cssWidth;
    this.cssWidth = Math.max(280, width);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.cssWidth * this.dpr);
    this.canvas.height = Math.floor(660 * this.dpr);
    this.canvas.style.width = `${this.cssWidth}px`;
    this.canvas.style.height = '660px';
  }

  public update(dt: number): void {
    const context = this.context;
    const scale = this.dpr;
    const height = 660;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, this.cssWidth, height);
    this.paintBackground(context);
    for (const [neuron, glow] of this.spikeGlow.entries()) {
      const next = glow - dt * 4.2;
      if (next <= 0) {
        this.spikeGlow.delete(neuron);
      } else {
        this.spikeGlow.set(neuron, next);
      }
    }
    for (const neuron of this.brain.lastSpikes) {
      this.spikeGlow.set(neuron, 1);
    }
    const positions = this.neuronPositions();
    this.paintConnections(context, positions);
    this.paintNeurons(context, positions);
    this.paintRaster(context);
    this.paintPopulationBars(context);
    this.paintMotorReadout();
  }

  private paintBackground(context: CanvasRenderingContext2D): void {
    context.fillStyle = '#050a19';
    context.fillRect(0, 0, this.cssWidth, 660);
    context.fillStyle = '#0a1730';
    context.fillRect(0, this.graphHeight, this.cssWidth, this.rasterHeight);
    context.fillStyle = '#081426';
    context.fillRect(0, this.graphHeight + this.rasterHeight, this.cssWidth, 154);
    context.strokeStyle = '#123556';
    context.lineWidth = 1;
    for (let y = 0; y < 660; y += 20) {
      context.beginPath();
      context.moveTo(0, y + 0.5);
      context.lineTo(this.cssWidth, y + 0.5);
      context.stroke();
    }
  }

  private neuronPositions(): Point[] {
    const left = 18;
    const right = this.cssWidth - 18;
    const width = right - left;
    return this.brain.connectome.neurons.map((neuron) => ({
      x: left + neuron.x * width,
      y: 18 + ((neuron.y + 1) / 2) * (this.graphHeight - 40),
    }));
  }

  private paintConnections(context: CanvasRenderingContext2D, positions: Point[]): void {
    context.lineWidth = 0.45;
    for (const synapse of this.brain.connectome.synapses) {
      const from = positions[synapse.source];
      const to = positions[synapse.target];
      if (!from || !to) {
        continue;
      }
      context.strokeStyle = synapse.weight < 0 ? '#ff477c22' : '#64dfff20';
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    }
  }

  private paintNeurons(context: CanvasRenderingContext2D, positions: Point[]): void {
    for (const neuron of this.brain.connectome.neurons) {
      const point = positions[neuron.id];
      if (!point) {
        continue;
      }
      const glow = this.spikeGlow.get(neuron.id) ?? 0;
      const rate = this.brain.network.firingRates[neuron.id] ?? 0;
      const radius = 2.2 + Math.min(3, rate / 22) + glow * 4;
      context.globalAlpha = 0.25 + Math.min(0.75, glow + rate / 100);
      context.fillStyle = neuron.color;
      context.shadowBlur = glow > 0 ? 14 : 0;
      context.shadowColor = neuron.color;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
    }
    context.globalAlpha = 1;
    context.fillStyle = '#6b9ab1';
    context.font = '9px monospace';
    context.fillText('SENSORY', 8, 12);
    context.fillText('CENTRAL', this.cssWidth * 0.43, 12);
    context.fillText('MOTOR', this.cssWidth * 0.83, 12);
  }

  private paintRaster(context: CanvasRenderingContext2D): void {
    const top = this.graphHeight;
    context.fillStyle = '#83dfff';
    context.font = '9px monospace';
    context.fillText('SPIKE RASTER // ROLLING 2 SEC', 10, top + 16);
    const now = this.brain.network.simulationTime;
    const left = 12;
    const width = this.cssWidth - 24;
    for (const neuron of this.brain.connectome.neurons) {
      const spikes = this.brain.network.recentSpikes(neuron.id, 2);
      context.fillStyle = neuron.color;
      for (const spikeTime of spikes) {
        const x = left + ((spikeTime - (now - 2)) / 2) * width;
        const y = top + 25 + (neuron.id % 80) * 1.05;
        context.fillRect(x, y, 2, 1.5);
      }
    }
    context.strokeStyle = '#3cf2ff66';
    context.beginPath();
    context.moveTo(left + width, top + 22);
    context.lineTo(left + width, top + this.rasterHeight - 5);
    context.stroke();
  }

  private paintPopulationBars(context: CanvasRenderingContext2D): void {
    const top = this.graphHeight + this.rasterHeight;
    context.fillStyle = '#8bd4e9';
    context.font = '9px monospace';
    context.fillText('POPULATION ACTIVITY // SPIKES / SEC', 10, top + 16);
    const rates = this.brain.populationRates();
    POPULATIONS.forEach((population, index) => {
      const y = top + 28 + index * 10.5;
      const rate = rates[population] ?? 0;
      context.fillStyle = this.brain.connectome.neurons.find((neuron) => neuron.population === population)?.color ?? '#fff';
      context.fillText(population.padEnd(5, ' '), 10, y);
      context.fillRect(53, y - 7, Math.min(this.cssWidth - 66, rate * 2.2), 5);
      context.fillStyle = '#6b9ab1';
      context.fillText(`${rate.toFixed(1).padStart(5, ' ')} Hz`, this.cssWidth - 58, y);
    });
  }

  private paintMotorReadout(): void {
    const command = this.brain.command;
    this.motorReadout.innerHTML = [
      '<span class="readout-title">MOTOR DECODE</span>',
      `<span>L/R ${command.leftRate.toFixed(1)} / ${command.rightRate.toFixed(1)}</span>`,
      `<span>THRUST ${command.thrust.toFixed(2)} // ${command.forwardRate.toFixed(1)}Hz</span>`,
      `<span class="${command.fire ? 'hot' : ''}">FIRE ${command.fire ? 'ARMED' : 'idle'} // ${command.fireRate.toFixed(1)}Hz</span>`,
      `<span class="${command.evade ? 'hot' : ''}">EVADE ${command.evade ? 'ACTIVE' : 'idle'}</span>`,
    ].join('');
  }

  private handlePointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const positions = this.neuronPositions();
    let closest = Number.POSITIVE_INFINITY;
    let match: number | undefined;
    for (const [id, point] of positions.entries()) {
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < 10 && distance < closest) {
        closest = distance;
        match = id;
      }
    }
    if (match === undefined) {
      this.tooltip.textContent = '';
      return;
    }
    const neuron = this.brain.connectome.neurons[match];
    if (!neuron) {
      return;
    }
    this.tooltip.textContent = `${neuron.name} // ${neuron.population} // ${(
      this.brain.network.firingRates[match] ?? 0
    ).toFixed(1)} Hz`;
    this.tooltip.style.left = `${Math.min(this.cssWidth - 190, x + 10)}px`;
    this.tooltip.style.top = `${Math.min(380, y + 8)}px`;
  }
}
