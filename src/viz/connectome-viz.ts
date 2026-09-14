import type { Population } from '../brain/connectome.ts';
import type { FlyBrain } from '../brain/fly-brain.ts';
import type { PlasticitySnapshot, RewardEvent } from '../brain/plasticity.ts';
import type { VisionFrame } from '../game/vision.ts';

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

const POPULATION_LABELS: Record<Population, string> = {
  ORN: 'Olfactory receptor',
  VIS: 'Optic lobe (VIS)',
  TGT: 'Target detectors',
  THR: 'Threat detectors',
  PN: 'Projection neurons',
  KC: 'Kenyon cells',
  MBON: 'MB output',
  CX: 'Central complex',
  LAL_L: 'LAL left',
  LAL_R: 'LAL right',
  DN: 'Descending',
};

/** Restrained, print-like palette: one hue family per pathway. */
const POPULATION_TONES: Record<Population, string> = {
  ORN: '#8fa66f',
  VIS: '#6f9bb3',
  TGT: '#c9a25c',
  THR: '#b96a5c',
  PN: '#8c8fb0',
  KC: '#a48cb0',
  MBON: '#b08ca0',
  CX: '#7fae8c',
  LAL_L: '#c2a878',
  LAL_R: '#c2a878',
  DN: '#d8d6cc',
};

const INK = {
  bg: '#15181a',
  panel: '#1a1e20',
  panelAlt: '#1e2325',
  grid: '#2b3134',
  gridSoft: '#242a2d',
  text: '#d8d6cc',
  muted: '#8a918c',
  faint: '#5d6560',
  accent: '#c9a25c',
  excitatory: '#7fae8c',
  inhibitory: '#b96a5c',
  dopamine: '#d7a24a',
  octopamine: '#c0605a',
  serotonin: '#6f9bb3',
};

const FONT = '10px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const FONT_SMALL = '9px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const FONT_MONO = '10px ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const RASTER_WINDOW = 2;
const HISTORY_SECONDS = 24;
const HISTORY_SAMPLES = 288;

interface Section {
  top: number;
  height: number;
}

interface Layout {
  rates: Section;
  sensory: Section;
  raster: Section;
  synaptic: Section;
  modulators: Section;
  total: number;
}

interface MotorRow {
  fill: HTMLElement;
  value: HTMLElement;
}

const EVENT_LABELS: Record<RewardEvent['kind'], string> = {
  food: 'nectar intake',
  'odor-gradient': 'odor gradient ascent',
  'target-hit': 'target hit',
  energy: 'energy restored',
  damage: 'damage',
  'threat-proximity': 'projectile proximity',
  collision: 'collision',
  locomotion: 'smooth locomotion',
  progress: 'forward progress',
  exploration: 'new zone explored',
  'wall-approach': 'wall approach',
  stuck: 'stuck',
  circling: 'tight circling',
};

/**
 * Lab-style connectome telemetry panel.
 *
 * Everything drawn here is read from live simulation state each frame:
 * per-neuron firing rates from the LIF window counter, the two-second spike
 * ring, live synaptic weights, and the neuromodulator/plasticity engine.
 */
export class ConnectomeVisualizer {
  public readonly element = document.createElement('aside');
  public readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private readonly header = document.createElement('header');
  private readonly tooltip = document.createElement('div');
  private readonly motorReadout = document.createElement('section');
  private readonly eventLog = document.createElement('section');
  private readonly headerFields = new Map<string, HTMLElement>();
  private readonly motorRows = new Map<string, MotorRow>();
  private turnNeedle!: HTMLElement;
  private thrustFill!: HTMLElement;
  private behaviorValue!: HTMLElement;
  private explorationValue!: HTMLElement;
  private cssWidth = 380;
  private dpr = 1;
  private layout: Layout = this.computeLayout();
  private readonly populationHistory = new Map<Population, Float32Array>();
  private readonly dopamineHistory = new Float32Array(HISTORY_SAMPLES);
  private readonly octopamineHistory = new Float32Array(HISTORY_SAMPLES);
  private readonly serotoninHistory = new Float32Array(HISTORY_SAMPLES);
  private readonly shiftHistory = new Float32Array(HISTORY_SAMPLES);
  private historyCursor = 0;
  private historyAccumulator = 0;
  private readonly synapticMatrix: Float32Array;
  private readonly pairIndex: Int16Array;
  private hoverNeuron: number | undefined;
  private lastEventKey = '';

  public constructor(
    private readonly brain: FlyBrain,
    private readonly visionProvider: () => VisionFrame | undefined = () => undefined,
  ) {
    this.element.className = 'viz-panel';
    this.element.setAttribute('aria-label', 'Connectome telemetry');
    this.canvas.setAttribute('aria-label', 'Neural telemetry charts');
    this.canvas.setAttribute('role', 'img');
    this.header.className = 'viz-header';
    this.tooltip.className = 'neuron-tooltip';
    this.tooltip.hidden = true;
    this.motorReadout.className = 'motor-readout';
    this.eventLog.className = 'event-log';
    this.buildHeader();
    this.buildMotorReadout();
    this.element.append(this.header, this.canvas, this.tooltip, this.motorReadout, this.eventLog);
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context unavailable');
    }
    this.context = context;
    for (const population of POPULATIONS) {
      this.populationHistory.set(population, new Float32Array(HISTORY_SAMPLES));
    }
    this.synapticMatrix = new Float32Array(POPULATIONS.length * POPULATIONS.length);
    this.pairIndex = new Int16Array(this.brain.connectome.synapses.length);
    const populationIndex = new Map(POPULATIONS.map((population, index) => [population, index]));
    for (const [index, synapse] of this.brain.connectome.synapses.entries()) {
      const source = this.brain.connectome.neurons[synapse.source]?.population;
      const target = this.brain.connectome.neurons[synapse.target]?.population;
      const row = source ? populationIndex.get(source) : undefined;
      const column = target ? populationIndex.get(target) : undefined;
      this.pairIndex[index] = row === undefined || column === undefined ? -1 : row * POPULATIONS.length + column;
    }
    this.canvas.addEventListener('pointermove', (event) => this.handlePointer(event));
    this.canvas.addEventListener('pointerleave', () => {
      this.hoverNeuron = undefined;
      this.tooltip.hidden = true;
    });
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private buildHeader(): void {
    const title = document.createElement('h2');
    title.textContent = 'Connectome telemetry';
    const subtitle = document.createElement('p');
    subtitle.className = 'viz-subtitle';
    subtitle.textContent = `${this.brain.connectome.neurons.length} LIF neurons · ${this.brain.connectome.synapses.length} synapses · 1 ms step`;
    const fields = document.createElement('dl');
    fields.className = 'viz-fields';
    for (const [key, label] of [
      ['time', 't (s)'],
      ['rate', 'mean rate'],
      ['spikes', 'spikes / step'],
      ['state', 'plasticity'],
    ] as const) {
      const term = document.createElement('dt');
      term.textContent = label;
      const value = document.createElement('dd');
      value.textContent = '—';
      value.dataset['field'] = key;
      fields.append(term, value);
      this.headerFields.set(key, value);
    }
    this.header.append(title, subtitle, fields);
  }

  private buildMotorReadout(): void {
    const title = document.createElement('h3');
    title.textContent = 'Descending neurons → motor decode';
    this.motorReadout.append(title);
    const gauges = document.createElement('div');
    gauges.className = 'motor-gauges';
    gauges.innerHTML = `
      <div class="gauge turn-gauge"><span class="gauge-label">turn</span><div class="gauge-track"><i class="needle"></i></div><span class="gauge-ends"><em>L</em><em>R</em></span></div>
      <div class="gauge thrust-gauge"><span class="gauge-label">thrust</span><div class="gauge-track"><i class="fill"></i></div></div>`;
    this.turnNeedle = gauges.querySelector('.needle') as HTMLElement;
    this.thrustFill = gauges.querySelector('.fill') as HTMLElement;
    this.motorReadout.append(gauges);
    const table = document.createElement('div');
    table.className = 'motor-table';
    const behavior = document.createElement('div');
    behavior.className = 'behavior-label';
    behavior.innerHTML = '<span class="motor-name">Behavior</span><span class="behavior-value">At rest</span>';
    this.behaviorValue = behavior.querySelector('.behavior-value') as HTMLElement;
    table.append(behavior);
    const exploration = document.createElement('div');
    exploration.className = 'behavior-label';
    exploration.innerHTML = '<span class="motor-name">exploration drive 0.00–1.00</span><span class="behavior-value">1.00</span>';
    this.explorationValue = exploration.querySelector('.behavior-value') as HTMLElement;
    table.append(exploration);
    for (const [key, label] of [
      ['leftRate', 'DN turn-L (DNa02-like)'],
      ['rightRate', 'DN turn-R (DNa02-like)'],
      ['forwardRate', 'DN forward (DNp09-like)'],
      ['brakeRate', 'DN brake (MDN-like)'],
      ['fireRate', 'DN fire'],
      ['evadeRate', 'DN evade (DNp01/GF-like)'],
    ] as const) {
      const row = document.createElement('div');
      row.className = 'motor-row';
      const name = document.createElement('span');
      name.className = 'motor-name';
      name.textContent = label;
      const track = document.createElement('div');
      track.className = 'motor-track';
      const fill = document.createElement('i');
      track.append(fill);
      const value = document.createElement('span');
      value.className = 'motor-value';
      value.textContent = '0.0 Hz';
      row.append(name, track, value);
      table.append(row);
      this.motorRows.set(key, { fill, value });
    }
    this.motorReadout.append(table);
  }

  private computeLayout(): Layout {
    const rates: Section = { top: 0, height: 22 + POPULATIONS.length * 15 + 10 };
    const sensory: Section = { top: rates.top + rates.height, height: 220 };
    const raster: Section = { top: sensory.top + sensory.height, height: 212 };
    const synaptic: Section = { top: raster.top + raster.height, height: 196 };
    const modulators: Section = { top: synaptic.top + synaptic.height, height: 168 };
    return { rates, sensory, raster, synaptic, modulators, total: modulators.top + modulators.height };
  }

  private resize(): void {
    const width = this.element.clientWidth || this.cssWidth;
    this.cssWidth = Math.max(280, width);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.layout = this.computeLayout();
    this.canvas.width = Math.floor(this.cssWidth * this.dpr);
    this.canvas.height = Math.floor(this.layout.total * this.dpr);
    this.canvas.style.width = `${this.cssWidth}px`;
    this.canvas.style.height = `${this.layout.total}px`;
  }

  public update(dt: number): void {
    const context = this.context;
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    context.fillStyle = INK.bg;
    context.fillRect(0, 0, this.cssWidth, this.layout.total);
    const rates = this.brain.populationRates();
    const plasticity = this.brain.plasticity.snapshot();
    this.sampleHistory(dt, rates, plasticity);
    this.updateSynapticMatrix(dt);
    this.paintHeader(rates, plasticity);
    this.paintRates(context, rates);
    this.paintSensory(context);
    this.paintRaster(context);
    this.paintSynaptic(context);
    this.paintModulators(context, plasticity);
    this.paintMotorReadout();
    this.paintEvents(plasticity);
  }

  private sampleHistory(dt: number, rates: Record<Population, number>, plasticity: PlasticitySnapshot): void {
    this.historyAccumulator += dt;
    const interval = HISTORY_SECONDS / HISTORY_SAMPLES;
    while (this.historyAccumulator >= interval) {
      this.historyAccumulator -= interval;
      for (const population of POPULATIONS) {
        const history = this.populationHistory.get(population);
        if (history) {
          history[this.historyCursor] = rates[population] ?? 0;
        }
      }
      this.dopamineHistory[this.historyCursor] = plasticity.dopamine;
      this.octopamineHistory[this.historyCursor] = plasticity.octopamine;
      this.serotoninHistory[this.historyCursor] = plasticity.serotonin;
      this.shiftHistory[this.historyCursor] = plasticity.stepWeightShift;
      this.historyCursor = (this.historyCursor + 1) % HISTORY_SAMPLES;
    }
  }

  /** Exponential moving estimate of transmitted synaptic drive per population pair. */
  private updateSynapticMatrix(dt: number): void {
    const decay = Math.exp(-dt / 0.35);
    for (let i = 0; i < this.synapticMatrix.length; i += 1) {
      this.synapticMatrix[i] = (this.synapticMatrix[i] ?? 0) * decay;
    }
    const weights = this.brain.network.weights;
    const rates = this.brain.network.firingRates;
    const synapses = this.brain.connectome.synapses;
    const gain = 1 - decay;
    for (let index = 0; index < synapses.length; index += 1) {
      const pair = this.pairIndex[index] ?? -1;
      if (pair < 0) {
        continue;
      }
      const synapse = synapses[index];
      if (!synapse) {
        continue;
      }
      const drive = (rates[synapse.source] ?? 0) * Math.abs(weights[index] ?? 0) * 0.001;
      this.synapticMatrix[pair] = (this.synapticMatrix[pair] ?? 0) + drive * gain;
    }
  }

  private paintHeader(rates: Record<Population, number>, plasticity: PlasticitySnapshot): void {
    const time = this.brain.network.simulationTime;
    let mean = 0;
    for (const population of POPULATIONS) {
      mean += rates[population] ?? 0;
    }
    mean /= POPULATIONS.length;
    this.setField('time', time.toFixed(1));
    this.setField('rate', `${mean.toFixed(1)} Hz`);
    this.setField('spikes', String(this.brain.lastSpikes.length));
    const state = this.headerFields.get('state');
    if (state) {
      state.textContent = plasticity.state;
      state.dataset['state'] = plasticity.state;
    }
  }

  private setField(key: string, value: string): void {
    const node = this.headerFields.get(key);
    if (node && node.textContent !== value) {
      node.textContent = value;
    }
  }

  private sectionTitle(context: CanvasRenderingContext2D, section: Section, title: string, note?: string): void {
    context.fillStyle = INK.panel;
    context.fillRect(0, section.top, this.cssWidth, section.height);
    context.strokeStyle = INK.grid;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, section.top + 0.5);
    context.lineTo(this.cssWidth, section.top + 0.5);
    context.stroke();
    context.fillStyle = INK.text;
    context.font = FONT;
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
    context.fillText(title, 14, section.top + 15);
    if (note) {
      context.fillStyle = INK.muted;
      context.font = FONT_SMALL;
      context.textAlign = 'right';
      context.fillText(note, this.cssWidth - 14, section.top + 15);
      context.textAlign = 'left';
    }
  }

  private paintRates(context: CanvasRenderingContext2D, rates: Record<Population, number>): void {
    const section = this.layout.rates;
    this.sectionTitle(context, section, 'Population firing rate', '100 ms window · Hz');
    const labelWidth = 118;
    const valueWidth = 54;
    const sparkWidth = 58;
    const barLeft = labelWidth;
    const barRight = this.cssWidth - valueWidth - sparkWidth - 14;
    const barWidth = Math.max(40, barRight - barLeft);
    const scale = 120;
    context.font = FONT_SMALL;
    context.fillStyle = INK.faint;
    for (const tick of [0, 40, 80, 120]) {
      const x = barLeft + (tick / scale) * barWidth;
      context.fillRect(Math.round(x), section.top + 22, 1, POPULATIONS.length * 15 + 2);
    }
    POPULATIONS.forEach((population, index) => {
      const y = section.top + 24 + index * 15;
      const rate = rates[population] ?? 0;
      context.fillStyle = INK.text;
      context.font = FONT;
      context.textAlign = 'left';
      context.fillText(population, 14, y + 10);
      context.fillStyle = INK.muted;
      context.font = FONT_SMALL;
      context.fillText(POPULATION_LABELS[population], 48, y + 10);
      context.fillStyle = INK.gridSoft;
      context.fillRect(barLeft, y + 3, barWidth, 7);
      context.fillStyle = POPULATION_TONES[population];
      context.fillRect(barLeft, y + 3, Math.min(barWidth, (rate / scale) * barWidth), 7);
      context.fillStyle = INK.text;
      context.font = FONT_MONO;
      context.textAlign = 'right';
      context.fillText(rate.toFixed(1), barLeft + barWidth + valueWidth - 6, y + 11);
      const history = this.populationHistory.get(population);
      if (history) {
        this.sparkline(context, history, this.cssWidth - sparkWidth - 14, y + 2, sparkWidth, 10, POPULATION_TONES[population], 160);
      }
    });
    context.textAlign = 'left';
  }

  private sparkline(
    context: CanvasRenderingContext2D,
    history: Float32Array,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    max: number,
  ): void {
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.globalAlpha = 0.85;
    context.beginPath();
    for (let i = 0; i < HISTORY_SAMPLES; i += 1) {
      const sample = history[(this.historyCursor + i) % HISTORY_SAMPLES] ?? 0;
      const px = x + (i / (HISTORY_SAMPLES - 1)) * width;
      const py = y + height - Math.min(1, sample / max) * height;
      if (i === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    }
    context.stroke();
    context.globalAlpha = 1;
  }

  private paintSensory(context: CanvasRenderingContext2D): void {
    const section = this.layout.sensory;
    this.sectionTitle(context, section, 'Sensory arrays · retinotopic map', 'egocentric · forward = up');
    const rates = this.brain.network.firingRates;
    const populations = this.brain.connectome.populations;
    const centerX = Math.round(this.cssWidth * 0.36);
    const centerY = section.top + 106;
    const drawRing = (neurons: number[], inner: number, outer: number, start: number, end: number, tone: string, max: number) => {
      const span = end - start;
      const count = neurons.length;
      for (const [index, neuron] of neurons.entries()) {
        const a0 = start + (index / count) * span;
        const a1 = start + ((index + 1) / count) * span - 0.012;
        const rate = rates[neuron] ?? 0;
        const level = Math.min(1, rate / max);
        context.beginPath();
        context.arc(centerX, centerY, outer, a0, a1);
        context.arc(centerX, centerY, inner, a1, a0, true);
        context.closePath();
        context.fillStyle = INK.gridSoft;
        context.fill();
        if (level > 0.01) {
          context.globalAlpha = 0.25 + level * 0.75;
          context.fillStyle = tone;
          context.fill();
          context.globalAlpha = 1;
        }
      }
    };
    // Heading 0 points "up"; sensors sweep the frontal hemifield from left to right.
    const start = -Math.PI * 1.08;
    const end = Math.PI * 0.08;
    drawRing(populations.THR, 62, 72, start, end, INK.inhibitory, 90);
    drawRing(populations.VIS, 40, 58, start, end, POPULATION_TONES.VIS, 120);
    drawRing(populations.TGT, 22, 36, start, end, POPULATION_TONES.TGT, 120);
    context.fillStyle = INK.text;
    context.beginPath();
    context.moveTo(centerX, centerY - 8);
    context.lineTo(centerX - 4, centerY + 3);
    context.lineTo(centerX + 4, centerY + 3);
    context.closePath();
    context.fill();
    context.font = FONT_SMALL;
    context.fillStyle = INK.muted;
    context.textAlign = 'left';
    context.fillText('THR', centerX - 90, centerY + 24);
    context.fillText('VIS', centerX - 72, centerY + 38);
    context.fillText('TGT', centerX - 52, centerY + 52);

    // Olfactory receptor array as a bilateral bar pair.
    const ornLeft = Math.round(this.cssWidth * 0.66);
    const ornWidth = this.cssWidth - ornLeft - 14;
    context.fillStyle = INK.text;
    context.font = FONT;
    context.fillText('ORN · olfactory', ornLeft, section.top + 38);
    const orn = populations.ORN;
    const columns = orn.length;
    const cell = Math.max(4, Math.floor(ornWidth / columns) - 1);
    for (const [index, neuron] of orn.entries()) {
      const rate = rates[neuron] ?? 0;
      const level = Math.min(1, rate / 90);
      const x = ornLeft + index * (cell + 1);
      const barHeight = 46;
      context.fillStyle = INK.gridSoft;
      context.fillRect(x, section.top + 46, cell, barHeight);
      context.fillStyle = POPULATION_TONES.ORN;
      context.globalAlpha = 0.35 + level * 0.65;
      context.fillRect(x, section.top + 46 + barHeight - level * barHeight, cell, level * barHeight);
      context.globalAlpha = 1;
    }
    context.fillStyle = INK.muted;
    context.font = FONT_SMALL;
    context.fillText('left', ornLeft, section.top + 106);
    context.textAlign = 'right';
    context.fillText('right', ornLeft + columns * (cell + 1) - 1, section.top + 106);
    context.textAlign = 'left';
    const populationRates = this.brain.populationRates();
    context.fillStyle = INK.text;
    context.font = FONT_MONO;
    context.fillText(`VIS ${(populationRates.VIS ?? 0).toFixed(1)} Hz`, ornLeft, section.top + 128);
    context.fillText(`TGT ${(populationRates.TGT ?? 0).toFixed(1)} Hz`, ornLeft, section.top + 142);
    context.fillText(`THR ${(populationRates.THR ?? 0).toFixed(1)} Hz`, ornLeft, section.top + 156);

    const vision = this.visionProvider?.();
    const stripLeft = 14;
    const stripWidth = this.cssWidth - 28;
    const loomingTop = section.top + 126;
    context.fillStyle = INK.text;
    context.font = FONT;
    context.fillText('LC4-like looming', stripLeft, loomingTop);
    const loomingCell = Math.max(3, stripWidth / 24 - 1);
    for (let index = 0; index < 24; index += 1) {
      const value = vision?.looming[index] ?? 0;
      const x = stripLeft + index * (stripWidth / 24);
      context.fillStyle = INK.gridSoft;
      context.fillRect(x, loomingTop + 6, loomingCell, 25);
      context.fillStyle = INK.inhibitory;
      context.fillRect(x, loomingTop + 31 - value * 25, loomingCell, value * 25);
    }
    context.fillStyle = INK.text;
    context.fillText('Compound eye', stripLeft, section.top + 172);
    for (let index = 0; index < 24; index += 1) {
      const ray = vision?.rays[index];
      const value = vision?.intensity[index] ?? 0;
      const x = stripLeft + index * (stripWidth / 24);
      context.fillStyle = ray?.hit === 'wall'
        ? '#9a8f7a'
        : ray?.hit === 'obstacle'
          ? '#c0a060'
          : ray?.hit === 'enemy'
            ? '#a65b4b'
            : '#6b7280';
      context.fillRect(x, section.top + 180 + (1 - value) * 28, loomingCell, value * 28);
    }
    context.fillStyle = INK.muted;
    context.font = FONT_SMALL;
    context.fillText('24 ommatidia · ±120° · raycast', stripLeft, section.top + 216);
  }

  private rasterGeometry(): { left: number; width: number; top: number; rowHeight: number } {
    const section = this.layout.raster;
    const left = 48;
    const width = this.cssWidth - left - 14;
    const top = section.top + 24;
    const rows = this.brain.connectome.neurons.length;
    const rowHeight = Math.max(0.8, (section.height - 48) / rows);
    return { left, width, top, rowHeight };
  }

  private paintRaster(context: CanvasRenderingContext2D): void {
    const section = this.layout.raster;
    this.sectionTitle(context, section, 'Spike raster', `${RASTER_WINDOW.toFixed(0)} s window · one row per neuron`);
    const { left, width, top, rowHeight } = this.rasterGeometry();
    const now = this.brain.network.simulationTime;
    context.fillStyle = INK.bg;
    context.fillRect(left, top, width, rowHeight * this.brain.connectome.neurons.length);
    context.font = FONT_SMALL;
    context.fillStyle = INK.faint;
    for (let tick = 0; tick <= 4; tick += 1) {
      const x = left + (tick / 4) * width;
      context.fillRect(Math.round(x), top, 1, rowHeight * this.brain.connectome.neurons.length);
      context.fillStyle = INK.muted;
      context.textAlign = tick === 4 ? 'right' : tick === 0 ? 'left' : 'center';
      context.fillText(`${(-RASTER_WINDOW + (tick / 4) * RASTER_WINDOW).toFixed(1)} s`, x, section.top + section.height - 8);
      context.fillStyle = INK.faint;
    }
    context.textAlign = 'left';
    let rowStart = 0;
    for (const population of POPULATIONS) {
      const neurons = this.brain.connectome.populations[population];
      const y0 = top + rowStart * rowHeight;
      const bandHeight = neurons.length * rowHeight;
      if (POPULATIONS.indexOf(population) % 2 === 1) {
        context.fillStyle = 'rgba(255,255,255,0.025)';
        context.fillRect(left, y0, width, bandHeight);
      }
      if (bandHeight >= 8) {
        context.fillStyle = INK.muted;
        context.fillText(population, 14, y0 + Math.min(bandHeight - 1, 9));
      }
      context.fillStyle = POPULATION_TONES[population];
      const markHeight = Math.max(1, rowHeight - 0.3);
      for (const [offset, neuron] of neurons.entries()) {
        const y = y0 + offset * rowHeight;
        for (const spikeTime of this.brain.network.recentSpikes(neuron, RASTER_WINDOW)) {
          const x = left + ((spikeTime - (now - RASTER_WINDOW)) / RASTER_WINDOW) * width;
          context.fillRect(x, y, 1.2, markHeight);
        }
      }
      rowStart += neurons.length;
    }
    if (this.hoverNeuron !== undefined) {
      const y = top + this.hoverNeuron * rowHeight;
      context.fillStyle = 'rgba(201,162,92,0.22)';
      context.fillRect(left, y - 1, width, rowHeight + 2);
    }
  }

  private paintSynaptic(context: CanvasRenderingContext2D): void {
    const section = this.layout.synaptic;
    this.sectionTitle(context, section, 'Synaptic transmission', 'presynaptic rate × |w| · EMA 350 ms');
    const cell = 12;
    const gridLeft = 52;
    const gridTop = section.top + 40;
    let max = 1e-6;
    for (const value of this.synapticMatrix) {
      max = Math.max(max, value);
    }
    context.font = FONT_SMALL;
    POPULATIONS.forEach((population, column) => {
      context.save();
      context.translate(gridLeft + column * (cell + 1) + cell / 2, gridTop - 4);
      context.rotate(-Math.PI / 3);
      context.fillStyle = INK.muted;
      context.textAlign = 'left';
      context.fillText(population, 0, 0);
      context.restore();
    });
    POPULATIONS.forEach((source, row) => {
      context.fillStyle = INK.muted;
      context.textAlign = 'right';
      context.fillText(source, gridLeft - 5, gridTop + row * (cell + 1) + cell - 2);
      POPULATIONS.forEach((_target, column) => {
        const value = this.synapticMatrix[row * POPULATIONS.length + column] ?? 0;
        const level = Math.sqrt(value / max);
        const x = gridLeft + column * (cell + 1);
        const y = gridTop + row * (cell + 1);
        context.fillStyle = INK.gridSoft;
        context.fillRect(x, y, cell, cell);
        if (level > 0.02) {
          context.globalAlpha = 0.15 + level * 0.85;
          context.fillStyle = INK.accent;
          context.fillRect(x, y, cell, cell);
          context.globalAlpha = 1;
        }
      });
    });
    context.textAlign = 'left';
    context.fillStyle = INK.faint;
    context.fillText('pre ↓ / post →', 14, gridTop + POPULATIONS.length * (cell + 1) + 10);

    // Excitatory / inhibitory balance and weight statistics on the right.
    const infoLeft = gridLeft + POPULATIONS.length * (cell + 1) + 18;
    const infoWidth = this.cssWidth - infoLeft - 14;
    let excitatory = 0;
    let inhibitory = 0;
    let excitatoryCount = 0;
    let inhibitoryCount = 0;
    const weights = this.brain.network.weights;
    const rates = this.brain.network.firingRates;
    for (const [index, synapse] of this.brain.connectome.synapses.entries()) {
      const drive = (rates[synapse.source] ?? 0) * Math.abs(weights[index] ?? 0) * 0.001;
      if (synapse.kind === 'excitatory') {
        excitatory += drive;
        excitatoryCount += 1;
      } else {
        inhibitory += drive;
        inhibitoryCount += 1;
      }
    }
    const total = Math.max(1e-6, excitatory + inhibitory);
    context.fillStyle = INK.text;
    context.font = FONT;
    context.fillText('E / I drive', infoLeft, gridTop + 6);
    if (infoWidth > 40) {
      context.fillStyle = INK.excitatory;
      context.fillRect(infoLeft, gridTop + 12, infoWidth * (excitatory / total), 7);
      context.fillStyle = INK.inhibitory;
      context.fillRect(infoLeft + infoWidth * (excitatory / total), gridTop + 12, infoWidth * (inhibitory / total), 7);
    }
    context.font = FONT_MONO;
    context.fillStyle = INK.muted;
    context.fillText(`E ${(excitatory / total * 100).toFixed(0)}%  I ${(inhibitory / total * 100).toFixed(0)}%`, infoLeft, gridTop + 32);
    context.fillText(`${excitatoryCount} exc · ${inhibitoryCount} inh`, infoLeft, gridTop + 46);
    const snapshot = this.brain.plasticity.snapshot();
    context.fillStyle = INK.text;
    context.font = FONT;
    context.fillText('Plastic set', infoLeft, gridTop + 70);
    context.font = FONT_MONO;
    context.fillStyle = INK.muted;
    context.fillText(`${snapshot.plasticSynapses} synapses`, infoLeft, gridTop + 84);
    context.fillText(`drift ${(snapshot.driftFromBaseline * 100).toFixed(2)}%`, infoLeft, gridTop + 98);
    context.fillText(`saturated ${(snapshot.saturatedFraction * 100).toFixed(1)}%`, infoLeft, gridTop + 112);
    context.fillText(`appetitive ${(snapshot.appetitiveBias * 100).toFixed(1)}%`, infoLeft, gridTop + 126);
    context.fillText(`aversive ${(snapshot.aversiveBias * 100).toFixed(1)}%`, infoLeft, gridTop + 140);
  }

  private paintModulators(context: CanvasRenderingContext2D, plasticity: PlasticitySnapshot): void {
    const section = this.layout.modulators;
    this.sectionTitle(context, section, 'Neuromodulators · plasticity', `${HISTORY_SECONDS} s history`);
    const chartLeft = 14;
    const chartWidth = Math.round(this.cssWidth * 0.56);
    const chartTop = section.top + 26;
    const chartHeight = 92;
    context.fillStyle = INK.bg;
    context.fillRect(chartLeft, chartTop, chartWidth, chartHeight);
    context.fillStyle = INK.faint;
    for (const level of [0.5, 1, 1.5]) {
      context.fillRect(chartLeft, Math.round(chartTop + chartHeight - (level / 2) * chartHeight), chartWidth, 1);
    }
    this.sparkline(context, this.serotoninHistory, chartLeft, chartTop, chartWidth, chartHeight, INK.serotonin, 2);
    this.sparkline(context, this.octopamineHistory, chartLeft, chartTop, chartWidth, chartHeight, INK.octopamine, 2);
    this.sparkline(context, this.dopamineHistory, chartLeft, chartTop, chartWidth, chartHeight, INK.dopamine, 2);
    context.font = FONT_SMALL;
    context.fillStyle = INK.faint;
    context.textAlign = 'left';
    context.fillText('0', chartLeft + 2, chartTop + chartHeight - 2);
    context.fillText('2.0', chartLeft + 2, chartTop + 9);
    context.fillText(`−${HISTORY_SECONDS} s`, chartLeft + 20, chartTop + chartHeight + 12);
    context.textAlign = 'right';
    context.fillText('now', chartLeft + chartWidth, chartTop + chartHeight + 12);
    context.textAlign = 'left';

    const legendLeft = chartLeft + chartWidth + 14;
    const rows: Array<[string, string, number, string]> = [
      ['DA', 'dopamine', plasticity.dopamine, INK.dopamine],
      ['OA', 'octopamine', plasticity.octopamine, INK.octopamine],
      ['5-HT', 'serotonin', plasticity.serotonin, INK.serotonin],
    ];
    rows.forEach(([short, name, value, color], index) => {
      const y = chartTop + 8 + index * 20;
      context.fillStyle = color;
      context.fillRect(legendLeft, y - 6, 8, 8);
      context.fillStyle = INK.text;
      context.font = FONT;
      context.fillText(short, legendLeft + 13, y + 1);
      context.fillStyle = INK.muted;
      context.font = FONT_SMALL;
      context.fillText(name, legendLeft + 40, y + 1);
      context.fillStyle = INK.text;
      context.font = FONT_MONO;
      context.textAlign = 'right';
      context.fillText(value.toFixed(2), this.cssWidth - 14, y + 1);
      context.textAlign = 'left';
    });
    const statsTop = chartTop + 74;
    context.font = FONT_MONO;
    context.fillStyle = INK.muted;
    context.fillText(`η ${plasticity.effectiveLearningRate.toFixed(4)} / ${plasticity.learningRate.toFixed(3)}`, legendLeft, statsTop);
    context.fillText(`Σ|Δw| ${(plasticity.stepWeightShift * 1e4).toFixed(2)} ‱`, legendLeft, statsTop + 14);
    context.fillText(`stress ${plasticity.stress.toFixed(2)}`, legendLeft, statsTop + 28);
    context.fillText(`R ${plasticity.rewardsDelivered} · P ${plasticity.punishmentsDelivered}`, legendLeft, statsTop + 42);
  }

  private paintMotorReadout(): void {
    const command = this.brain.command;
    const scale = 80;
    for (const [key, row] of this.motorRows) {
      const value = command[key as keyof typeof command];
      const rate = typeof value === 'number' ? value : 0;
      row.fill.style.width = `${Math.min(100, (rate / scale) * 100)}%`;
      const text = `${rate.toFixed(1)} Hz`;
      if (row.value.textContent !== text) {
        row.value.textContent = text;
      }
    }
    this.turnNeedle.style.left = `${50 + command.turn * 48}%`;
    this.thrustFill.style.width = `${Math.max(0, Math.min(1, command.thrust)) * 100}%`;
    this.motorReadout.classList.toggle('firing', command.fire);
    this.motorReadout.classList.toggle('evading', command.evade);
    if (this.behaviorValue.textContent !== command.behavior) {
      this.behaviorValue.textContent = command.behavior;
    }
    const exploration = command.exploration.toFixed(2);
    if (this.explorationValue.textContent !== exploration) {
      this.explorationValue.textContent = exploration;
    }
  }

  private paintEvents(plasticity: PlasticitySnapshot): void {
    const events = plasticity.recentEvents.slice(-6).reverse();
    const key = events.map((event) => `${event.time.toFixed(2)}:${event.kind}:${event.value.toFixed(3)}`).join('|');
    if (key === this.lastEventKey) {
      return;
    }
    this.lastEventKey = key;
    this.eventLog.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = 'Reinforcement events';
    this.eventLog.append(title);
    if (events.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'event-empty';
      empty.textContent = 'No reward or punishment delivered yet.';
      this.eventLog.append(empty);
      return;
    }
    const list = document.createElement('ol');
    for (const event of events) {
      const item = document.createElement('li');
      item.dataset['valence'] = event.value >= 0 ? 'reward' : 'punishment';
      const time = document.createElement('span');
      time.className = 'event-time';
      time.textContent = `${event.time.toFixed(1)} s`;
      const label = document.createElement('span');
      label.className = 'event-label';
      label.textContent = EVENT_LABELS[event.kind];
      const value = document.createElement('span');
      value.className = 'event-value';
      value.textContent = `${event.value >= 0 ? '+' : '−'}${Math.abs(event.value).toFixed(2)} ${event.value >= 0 ? 'DA' : 'OA'}`;
      item.append(time, label, value);
      list.append(item);
    }
    this.eventLog.append(list);
  }

  private handlePointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const { left, width, top, rowHeight } = this.rasterGeometry();
    const rows = this.brain.connectome.neurons.length;
    if (x < left || x > left + width || y < top || y > top + rows * rowHeight) {
      this.hoverNeuron = undefined;
      this.tooltip.hidden = true;
      return;
    }
    const row = Math.min(rows - 1, Math.max(0, Math.floor((y - top) / rowHeight)));
    let seen = 0;
    let neuronId: number | undefined;
    for (const population of POPULATIONS) {
      const neurons = this.brain.connectome.populations[population];
      if (row < seen + neurons.length) {
        neuronId = neurons[row - seen];
        break;
      }
      seen += neurons.length;
    }
    if (neuronId === undefined) {
      return;
    }
    this.hoverNeuron = row;
    const neuron = this.brain.connectome.neurons[neuronId];
    if (!neuron) {
      return;
    }
    const rate = this.brain.network.firingRates[neuronId] ?? 0;
    const voltage = this.brain.network.voltages[neuronId] ?? 0;
    this.tooltip.textContent = `${neuron.name} · ${POPULATION_LABELS[neuron.population]} · ${rate.toFixed(1)} Hz · Vm ${voltage.toFixed(1)} mV`;
    this.tooltip.hidden = false;
    this.tooltip.style.left = `${Math.max(8, Math.min(this.cssWidth - 230, x - 60))}px`;
    this.tooltip.style.top = `${y + this.canvas.offsetTop - 26}px`;
  }
}
