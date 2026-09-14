import { RNG } from '../core/rng.ts';

export type Population =
  | 'ORN'
  | 'VIS'
  | 'TGT'
  | 'THR'
  | 'PN'
  | 'KC'
  | 'MBON'
  | 'CX'
  | 'LAL_L'
  | 'LAL_R'
  | 'DN';

export interface NeuronDef {
  id: number;
  name: string;
  population: Population;
  index: number;
  x: number;
  y: number;
  color: string;
}

export interface SynapseDef {
  source: number;
  target: number;
  weight: number;
  delay: number;
  kind: 'excitatory' | 'inhibitory';
}

export interface Connectome {
  neurons: NeuronDef[];
  synapses: SynapseDef[];
  populations: Record<Population, number[]>;
  dn: {
    turnLeft: number;
    turnRight: number;
    forward: number;
    brake: number;
    fire: number;
    evade: number;
  };
}

export const POPULATION_SIZES: Record<Population, number> = {
  ORN: 16,
  VIS: 24,
  TGT: 12,
  THR: 8,
  PN: 24,
  KC: 40,
  MBON: 8,
  CX: 16,
  LAL_L: 1,
  LAL_R: 1,
  DN: 6,
};

export const POPULATION_ORDER: Population[] = [
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

const POPULATION_COLORS: Record<Population, string> = {
  ORN: '#52e8ff',
  VIS: '#398fff',
  TGT: '#ffc857',
  THR: '#ff426d',
  PN: '#a66bff',
  KC: '#db75ff',
  MBON: '#ff45ba',
  CX: '#5dffc7',
  LAL_L: '#f6a845',
  LAL_R: '#f6d345',
  DN: '#f5fbff',
};

function createNeuron(
  id: number,
  population: Population,
  index: number,
  column: number,
): NeuronDef {
  const size = POPULATION_SIZES[population];
  const normalized = size === 1 ? 0.5 : index / (size - 1);
  const centered = normalized * 2 - 1;
  const ringAngle = (index / Math.max(1, size)) * Math.PI * 2;
  return {
    id,
    name: `${population}-${String(index + 1).padStart(2, '0')}`,
    population,
    index,
    x: column / (POPULATION_ORDER.length - 1),
    y: population === 'CX' ? Math.sin(ringAngle) * 0.76 : centered * 0.9,
    color: POPULATION_COLORS[population],
  };
}

export function buildConnectome(seed: number | string): Connectome {
  const rng = new RNG(seed);
  const neurons: NeuronDef[] = [];
  const populations = {} as Record<Population, number[]>;

  for (const [column, population] of POPULATION_ORDER.entries()) {
    populations[population] = [];
    for (let index = 0; index < POPULATION_SIZES[population]; index += 1) {
      const id = neurons.length;
      neurons.push(createNeuron(id, population, index, column));
      populations[population].push(id);
    }
  }

  const synapses: SynapseDef[] = [];
  const add = (
    source: number,
    target: number,
    weight: number,
    delay = 0.002,
  ): void => {
    synapses.push({
      source,
      target,
      weight: weight * 18,
      delay,
      kind: weight < 0 ? 'inhibitory' : 'excitatory',
    });
  };
  const connectProbability = (
    from: Population,
    to: Population,
    probability: number,
    weight: number,
    delay = 0.002,
  ): void => {
    for (const source of populations[from]) {
      for (const target of populations[to]) {
        if (rng.chance(probability)) {
          add(source, target, weight, delay);
        }
      }
    }
  };
  const connectAll = (
    from: Population,
    to: Population,
    weight: number,
    delay = 0.002,
  ): void => {
    for (const source of populations[from]) {
      for (const target of populations[to]) {
        add(source, target, weight, delay);
      }
    }
  };

  // Olfactory processing is bilateral and sparse: the PN/KC pathway makes ORN
  // direction influence the mushroom-body halves.
  connectProbability('ORN', 'PN', 0.58, 4.4);
  connectProbability('PN', 'KC', 0.22, 2.2);
  connectProbability('KC', 'MBON', 0.32, 2.5);

  // Visual crossed reflex: left visual space excites the right steering
  // channel, and right visual space excites the left channel.
  for (const [sensorIndex, source] of populations.VIS.entries()) {
    const target = sensorIndex < 12 ? populations.LAL_R[0] : populations.LAL_L[0];
    add(source, target as number, 5.2);
    add(source, populations.PN[sensorIndex % populations.PN.length] as number, 2.2);
  }

  // Target direction is a pursuit pathway; centre target sensors also drive
  // the fire command through a strong dedicated DN projection.
  for (const [sensorIndex, source] of populations.TGT.entries()) {
    const target = sensorIndex < 6 ? populations.LAL_L[0] : populations.LAL_R[0];
    add(source, target as number, 4.1);
    add(source, populations.PN[(sensorIndex + 5) % populations.PN.length] as number, 2.8);
    if (sensorIndex === 5 || sensorIndex === 6) {
      add(source, populations.DN[4] as number, 18.0);
    }
  }

  for (const source of populations.THR) {
    add(source, populations.DN[5] as number, 7.5);
    add(source, populations.DN[2] as number, -4.8);
    add(source, populations.DN[3] as number, 2.0);
  }

  // CX heading ring: nearby excitation, broad inhibition, and a small
  // persistence projection into the steering channels.
  for (const [index, source] of populations.CX.entries()) {
    add(source, populations.CX[(index + 1) % 16] as number, 2.7, 0.004);
    add(source, populations.CX[(index + 15) % 16] as number, 2.7, 0.004);
    for (const [targetIndex, target] of populations.CX.entries()) {
      if (Math.abs(index - targetIndex) > 1 && Math.abs(index - targetIndex) < 15) {
        add(source, target, -0.55, 0.005);
      }
    }
    add(source, (index < 8 ? populations.LAL_L[0] : populations.LAL_R[0]) as number, 0.75);
  }

  connectAll('MBON', 'LAL_L', 2.2);
  connectAll('MBON', 'LAL_R', 2.2);
  add(populations.LAL_L[0] as number, populations.DN[0] as number, 6.0);
  add(populations.LAL_R[0] as number, populations.DN[1] as number, 6.0);
  add(populations.LAL_L[0] as number, populations.LAL_R[0] as number, -4.4);
  add(populations.LAL_R[0] as number, populations.LAL_L[0] as number, -4.4);
  add(populations.DN[0] as number, populations.DN[1] as number, -3.8);
  add(populations.DN[1] as number, populations.DN[0] as number, -3.8);
  add(populations.DN[2] as number, populations.DN[3] as number, 2.4);
  add(populations.DN[3] as number, populations.DN[2] as number, -2.5);
  add(populations.DN[4] as number, populations.DN[5] as number, -1.7);
  add(populations.DN[5] as number, populations.DN[4] as number, -1.7);

  // Tonic forward drive is still decoded through DN_forward rather than
  // becoming a direct motor shortcut.
  for (const source of populations.MBON) {
    add(source, populations.DN[2] as number, 1.5);
  }
  for (const source of populations.KC) {
    if (rng.chance(0.1)) {
      add(source, populations.MBON[source % 4] as number, 1.7);
      add(source, populations.MBON[4 + (source % 4)] as number, 1.7);
    }
  }

  return {
    neurons,
    synapses,
    populations,
    dn: {
      turnLeft: populations.DN[0] as number,
      turnRight: populations.DN[1] as number,
      forward: populations.DN[2] as number,
      brake: populations.DN[3] as number,
      fire: populations.DN[4] as number,
      evade: populations.DN[5] as number,
    },
  };
}
