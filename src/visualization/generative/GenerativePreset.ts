export type GenerativeAlgorithm =
  | 'vector_field'
  | 'interference'
  | 'spiral'
  | 'fractal'
  | 'waveform'
  | 'kaleidoscope';

export type AudioMappingSource = 'bass' | 'mid' | 'treble' | 'amplitude' | 'beat' | 'waveform';
export type AudioMappingTarget = 'scale' | 'rotation' | 'noise' | 'impulse' | 'brightness' | 'displacement' | 'speed';

export interface GenerativePreset {
  version: 1;
  type: 'generated';
  name: string;
  seed: number;
  algorithm: GenerativeAlgorithm;
  parameters: {
    particleCount: number;
    noiseScale: number;
    speed: number;
    symmetry: number;
    scale: number;
    feedback: number;
    complexity: number;
    formula: number;
  };
  audioMappings: Partial<Record<AudioMappingSource, AudioMappingTarget>>;
  colorParameters: {
    a: [number, number, number];
    b: [number, number, number];
    c: [number, number, number];
  };
  motionParameters: {
    rotation: number;
    drift: number;
  };
  geometryParameters: {
    fold: number;
    twist: number;
  };
  createdAt: string;
  modifiedAt: string;
}

export const GENERATIVE_ALGORITHMS: readonly GenerativeAlgorithm[] = [
  'vector_field',
  'interference',
  'spiral',
  'fractal',
  'waveform',
  'kaleidoscope',
];

const MAPPING_SOURCES: AudioMappingSource[] = ['bass', 'mid', 'treble', 'beat', 'amplitude', 'waveform'];
const MAPPING_TARGETS: AudioMappingTarget[] = ['scale', 'rotation', 'noise', 'impulse', 'brightness', 'displacement', 'speed'];

export function createGenerativePreset(seed: number, now = new Date().toISOString()): GenerativePreset {
  const random = mulberry32(seed >>> 0);
  const algorithm = GENERATIVE_ALGORITHMS[Math.floor(random() * GENERATIVE_ALGORITHMS.length)];
  const audioMappings: GenerativePreset['audioMappings'] = {
    bass: 'scale',
    mid: pick(MAPPING_TARGETS, random),
    treble: pick(MAPPING_TARGETS, random),
    beat: 'impulse',
    amplitude: 'brightness',
    waveform: 'displacement',
  };
  for (const source of MAPPING_SOURCES) {
    if (!audioMappings[source]) audioMappings[source] = pick(MAPPING_TARGETS, random);
  }

  return {
    version: 1,
    type: 'generated',
    name: `Generated ${seed}`,
    seed,
    algorithm,
    parameters: {
      particleCount: 2048 + Math.floor(random() * 6144),
      noiseScale: 0.6 + random() * 2.4,
      speed: 0.25 + random() * 1.15,
      symmetry: 2 + Math.floor(random() * 7),
      scale: 0.7 + random() * 1.6,
      feedback: 0.55 + random() * 0.28,
      complexity: 1 + Math.floor(random() * 4),
      formula: Math.floor(random() * 6),
    },
    audioMappings,
    colorParameters: {
      a: hueColor(random(), 0.72, 0.42),
      b: hueColor(random() + 0.33, 0.8, 0.48),
      c: hueColor(random() + 0.62, 0.9, 0.62),
    },
    motionParameters: {
      rotation: random() * Math.PI * 2,
      drift: 0.15 + random() * 0.9,
    },
    geometryParameters: {
      fold: 2 + Math.floor(random() * 6),
      twist: random() * 2 - 1,
    },
    createdAt: now,
    modifiedAt: now,
  };
}

export function serializeGenerativePreset(preset: GenerativePreset): string {
  return JSON.stringify(preset);
}

export function deserializeGenerativePreset(raw: string): GenerativePreset {
  const parsed = JSON.parse(raw) as Partial<GenerativePreset>;
  if (parsed.version !== 1 || parsed.type !== 'generated' || typeof parsed.seed !== 'number') {
    throw new Error('Preset generativo incompatible');
  }
  if (!GENERATIVE_ALGORITHMS.includes(parsed.algorithm as GenerativeAlgorithm)) {
    throw new Error('Algoritmo generativo desconocido');
  }
  if (!parsed.parameters || !parsed.colorParameters || !parsed.audioMappings) {
    throw new Error('Preset generativo incompleto');
  }
  const formula = parsed.parameters.formula;
  parsed.parameters.formula = Number.isFinite(formula) ? Math.floor(formula as number) % 6 : Math.abs(parsed.seed) % 6;
  return parsed as GenerativePreset;
}

export function randomSeed(): number {
  const buffer = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buffer);
    return buffer[0] % 1_000_000_000;
  }
  return Math.floor(Math.random() * 1_000_000_000);
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(values: readonly T[], random: () => number): T {
  return values[Math.floor(random() * values.length)];
}

function hueColor(hue: number, saturation: number, light: number): [number, number, number] {
  const wrapped = ((hue % 1) + 1) % 1;
  const q = light < 0.5 ? light * (1 + saturation) : light + saturation - light * saturation;
  const p = 2 * light - q;
  const channel = (offset: number) => {
    const x = ((wrapped + offset) % 1 + 1) % 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 0.5) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [channel(1 / 3), channel(0), channel(-1 / 3)];
}
