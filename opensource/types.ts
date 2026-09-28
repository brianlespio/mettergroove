/**
 * Open Source DJ Deck Audio Analysis Library
 * 
 * High-performance, real-time audio analysis data types for DJ software decks,
 * horizontal spectrum analyzers, and multi-band scrolling waveforms.
 * 
 * @license MIT
 */

export interface DeckFrequencyBands {
  /** Low frequency energy (Sub/Kick: ~20Hz - 250Hz), normalized 0.0 - 1.0 */
  low: number;
  /** Mid frequency energy (Vocals/Snare: ~250Hz - 4000Hz), normalized 0.0 - 1.0 */
  mid: number;
  /** High frequency energy (Hi-Hats/Air: ~4000Hz - 20000Hz), normalized 0.0 - 1.0 */
  high: number;
}

export interface StereoDeckMetrics {
  /** Balance between Left (-1.0) and Right (+1.0) channels */
  balance: number;
  /** Phase correlation: +1.0 (pure mono in-phase), 0.0 (stereo independent), -1.0 (anti-phase cancellation) */
  correlation: number;
  /** Mid power (L + R) */
  midPower: number;
  /** Side power (L - R) */
  sidePower: number;
  /** Stereo width ratio [0.0 = mono, 1.0 = standard stereo, >1.0 = hyper-wide] */
  width: number;
  /** Left channel RMS amplitude (0.0 - 1.0) */
  rmsL: number;
  /** Right channel RMS amplitude (0.0 - 1.0) */
  rmsR: number;
  /** Left channel peak amplitude (0.0 - 1.0) */
  peakL: number;
  /** Right channel peak amplitude (0.0 - 1.0) */
  peakR: number;
}

/**
 * A single point on the horizontal logarithmic spectrum curve.
 */
export interface SpectrumPoint {
  /** Normalized X position on the horizontal bar [0.0 = 20Hz, 1.0 = 20kHz] */
  normalizedX: number;
  /** Center frequency in Hertz */
  frequencyHz: number;
  /** Current smoothed amplitude (0.0 = -60dB or lower, 1.0 = 0dB full-scale) */
  magnitude: number;
  /** Decibel level (e.g. -60 dB to 0 dB) */
  db: number;
  /** Current peak-hold magnitude with gravity decay (0.0 - 1.0) */
  peakHold: number;
}

/**
 * Multi-band slice recorded for scrolling DJ deck waveforms.
 */
export interface DeckWaveSlice {
  /** Bass core energy (0.0 - 1.0) */
  low: number;
  /** Mid frequency energy (0.0 - 1.0) */
  mid: number;
  /** High frequency and transient air (0.0 - 1.0) */
  high: number;
  /** Peak amplitude in Left channel */
  peakL: number;
  /** Peak amplitude in Right channel */
  peakR: number;
  /** Overall RMS power */
  rms: number;
  /** Whether a transient attack was triggered on this slice */
  isTransient: boolean;
}

/**
 * Comprehensive analysis snapshot computed per frame for a DJ Deck.
 */
export interface DeckAnalysisResult {
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Sample rate of the audio context (e.g. 44100, 48000) */
  sampleRate: number;
  /** Real-time 3-band energy isolation */
  bands: DeckFrequencyBands;
  /** Real-time stereo field metrics */
  stereo: StereoDeckMetrics;
  /** Horizontal spectrum curve points distributed logarithmically */
  spectrum: SpectrumPoint[];
  /** Latest wave slice suitable for appending to scrolling deck timelines */
  waveSlice: DeckWaveSlice;
  /** Transient attack intensity (0.0 to 1.0) */
  transientIntensity: number;
}

/**
 * Configuration options for the horizontal spectrum analyzer.
 */
export interface AnalyzerConfig {
  /** FFT size for frequency analysis (must be power of 2: 512, 1024, 2048, 4096). Default: 2048 */
  fftSize?: number;
  /** Crossover frequency dividing Low and Mid bands in Hz. Default: 250 */
  lowCrossoverHz?: number;
  /** Crossover frequency dividing Mid and High bands in Hz. Default: 4000 */
  highCrossoverHz?: number;
  /** Minimum frequency for horizontal display in Hz. Default: 20 */
  minFrequencyHz?: number;
  /** Maximum frequency for horizontal display in Hz. Default: 20000 */
  maxFrequencyHz?: number;
  /** Number of interpolated horizontal points along the frequency axis. Default: 128 */
  horizontalPoints?: number;
  /** Ballistic smoothing factor [0.0 = raw FFT, 0.95 = heavily smoothed]. Default: 0.65 */
  smoothingTimeConstant?: number;
  /** Peak hold decay rate in units per second. Default: 1.2 */
  peakDecayRate?: number;
  /** Peak hold duration in seconds before gravity descent begins. Default: 0.5 */
  peakHoldDuration?: number;
}
