export type VisualizationFamily = 'analyzer' | 'audio-rhythmic' | 'generative';

export const VISUALIZATION_FAMILIES: readonly { id: VisualizationFamily; label: string; description: string }[] = [
  {
    id: 'analyzer',
    label: 'Analizadores',
    description: 'Forma de onda, espectro y estéreo actuales',
  },
  {
    id: 'audio-rhythmic',
    label: 'Audio rítmico',
    description: 'Presets MilkDrop / projectM',
  },
  {
    id: 'generative',
    label: 'Generativo',
    description: 'Campos, partículas y geometría matemática',
  },
];
