import { ColorScheme, ColorSchemeId } from '../types/audio';

export const COLOR_SCHEMES: Record<ColorSchemeId, ColorScheme> = {
  spectrum: {
    id: 'spectrum',
    name: 'Spectrum (Caliente & Frío)',
    tagline: 'Bajos rojos caliente, medios tibios claros y agudos claros fríos',
    background: '#090a0d',
    gridLine: 'rgba(255, 255, 255, 0.12)',
    textMuted: 'rgba(255, 255, 255, 0.45)',
    lowBand: '#ff1e27',       // Bajos rojos caliente (Hot Red)
    midBand: '#f97316',       // Medios intermedios tibios (Warm Orange-Amber)
    midHighBand: '#84cc16',   // Medios agudos tibios claros (Bright Lime)
    highBand: '#00e5ff',      // Agudos claros fríos (Electric Ice Cyan)
    waveformL: '#ff1e27',
    waveformR: '#00e5ff',
    transient: '#ffffff',     // Brilliant White needle flash
    peakHold: '#00f0ff',
    stereoIndicator: '#84cc16',
    gradientSpectrum: [
      [0.0, '#ff1a24'],       // Bajos rojos caliente profundo
      [0.18, '#ff3b30'],      // Bajos rojos caliente brillante
      [0.35, '#f97316'],      // Medios intermedios naranja cálido
      [0.52, '#eab308'],      // Medios intermedios ámbar tibio
      [0.68, '#84cc16'],      // Medios agudos tibios claros (lima brillante)
      [0.82, '#00e5ff'],      // Agudos claros fríos (cian hielo eléctrico)
      [0.93, '#38bdf8'],      // Agudos claros fríos (azul cielo cristalino)
      [1.0, '#818cf8'],       // Agudos claros fríos (lavanda hielo)
    ],
  },
  infrared: {
    id: 'infrared',
    name: 'Infrared',
    tagline: 'Fuego y ámbar cálido: Rojo profundo, naranja ardiente y oro',
    background: '#0c0705',
    gridLine: 'rgba(249, 115, 22, 0.1)',
    textMuted: 'rgba(253, 186, 116, 0.45)',
    lowBand: '#dc2626',       // Deep Crimson Bass
    midBand: '#ea580c',       // Glowing Tangerine Mids
    highBand: '#facc15',      // Golden Yellow Highs
    waveformL: '#ea580c',
    waveformR: '#f59e0b',
    transient: '#fffbeb',     // Warm White Flash
    peakHold: '#fef08a',
    stereoIndicator: '#f97316',
    gradientSpectrum: [
      [0.0, '#7f1d1d'],
      [0.25, '#b91c1c'],
      [0.55, '#ea580c'],
      [0.82, '#f59e0b'],
      [1.0, '#fef08a'],
    ],
  },
  'x-ray': {
    id: 'x-ray',
    name: 'X-Ray',
    tagline: 'Monocromo de alto contraste: Pizarras profundas, plata y blanco puro',
    background: '#07080a',
    gridLine: 'rgba(255, 255, 255, 0.08)',
    textMuted: 'rgba(255, 255, 255, 0.4)',
    lowBand: '#334155',       // Deep Charcoal Slate
    midBand: '#94a3b8',       // Crisp Silver Mids
    highBand: '#ffffff',      // Pure White Highs
    waveformL: '#e2e8f0',
    waveformR: '#94a3b8',
    transient: '#ffffff',     // High-intensity white
    peakHold: '#38bdf8',
    stereoIndicator: '#ffffff',
    gradientSpectrum: [
      [0.0, '#0f172a'],
      [0.25, '#334155'],
      [0.55, '#64748b'],
      [0.8, '#cbd5e1'],
      [1.0, '#ffffff'],
    ],
  },
  ultraviolet: {
    id: 'ultraviolet',
    name: 'Ultraviolet',
    tagline: 'Luz negra y neón frío: Índigo profundo, azul eléctrico y cian hielo',
    background: '#070712',
    gridLine: 'rgba(99, 102, 241, 0.12)',
    textMuted: 'rgba(165, 180, 252, 0.45)',
    lowBand: '#6366f1',       // Deep Indigo / Violet Bass
    midBand: '#06b6d4',       // Electric Cyan / Teal Mids
    highBand: '#38bdf8',      // Ice Blue Highs
    waveformL: '#818cf8',
    waveformR: '#38bdf8',
    transient: '#ffffff',     // Crisp White Transient
    peakHold: '#ec4899',
    stereoIndicator: '#818cf8',
    gradientSpectrum: [
      [0.0, '#312e81'],
      [0.28, '#4f46e5'],
      [0.55, '#0284c7'],
      [0.8, '#06b6d4'],
      [1.0, '#38bdf8'],
    ],
  },
  studio: {
    id: 'studio',
    name: 'Studio Pro',
    tagline: 'Paleta moderna de estudio con violetas y verde neón',
    background: '#0d0d12',
    gridLine: 'rgba(255, 255, 255, 0.08)',
    textMuted: 'rgba(255, 255, 255, 0.45)',
    lowBand: '#6366f1',
    midBand: '#22c55e',
    highBand: '#ec4899',
    waveformL: '#818cf8',
    waveformR: '#a855f7',
    transient: '#f8fafc',
    peakHold: '#f43f5e',
    stereoIndicator: '#a855f7',
    gradientSpectrum: [
      [0.0, '#4338ca'],
      [0.25, '#6366f1'],
      [0.55, '#22c55e'],
      [0.8, '#eab308'],
      [1.0, '#ec4899'],
    ],
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    tagline: 'Estética synthwave: Violeta ultravioleta y fucsia láser',
    background: '#08080f',
    gridLine: 'rgba(236, 72, 153, 0.12)',
    textMuted: 'rgba(255, 255, 255, 0.5)',
    lowBand: '#8b5cf6',
    midBand: '#06b6d4',
    highBand: '#f43f5e',
    waveformL: '#06b6d4',
    waveformR: '#ec4899',
    transient: '#ffffff',
    peakHold: '#fbbf24',
    stereoIndicator: '#ec4899',
    gradientSpectrum: [
      [0.0, '#7c3aed'],
      [0.3, '#2563eb'],
      [0.6, '#06b6d4'],
      [0.85, '#ec4899'],
      [1.0, '#fbbf24'],
    ],
  },
};
