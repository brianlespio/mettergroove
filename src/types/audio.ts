/**
 * Audio Visualizer Data Model & Configuration Types
 * Designed for High-Precision Real-Time Waveform, Multi-Band Spectrum, and Stereo Metering.
 * Includes Professional DJ Deck Waveform Color Modes: Spectrum, Infrared, X-Ray, Ultraviolet.
 */

export type VisualizerMode = 'combined' | 'waveform' | 'spectrum' | 'stereo' | 'levels';

export type WaveformShape = 'smooth-curves' | 'rounded-bars';

export type ColorSchemeId = 
  | 'spectrum' 
  | 'infrared' 
  | 'x-ray' 
  | 'ultraviolet' 
  | 'studio' 
  | 'cyberpunk';

export interface BandEnergies {
  low: number;       // 20Hz - 250Hz (Bajos rojo caliente)
  mid: number;       // 250Hz - 2200Hz (Medios intermedios tibios)
  midHigh?: number;  // 2200Hz - 6000Hz (Medios agudos tibios claros)
  high: number;      // 6000Hz - 20000Hz (Agudos claros fríos)
}

export interface StereoMetrics {
  balance: number;      // -1.0 (full Left) to +1.0 (full Right)
  correlation: number;  // -1.0 (out of phase) to +1.0 (pure mono in-phase)
  midPower: number;     // Energy in Mid channel (L + R)
  sidePower: number;    // Energy in Side channel (L - R)
  width: number;        // Stereo width ratio [0.0 = mono, 1.0 = balanced, >1.0 = hyper-wide]
  rmsL: number;
  rmsR: number;
  peakL: number;
  peakR: number;
}

export interface AudioFrameData {
  timeDomainL: Float32Array;
  timeDomainR: Float32Array;
  frequencyL: Uint8Array;
  frequencyR: Uint8Array;
  sampleRate: number;
  fftSize: number;
  metrics: StereoMetrics;
  bands: BandEnergies;
}

/**
 * DJ Deck multi-band waveform historical slice.
 * Contains decomposed 3/4-band energy, peak envelope, and frequency dominance color.
 */
export interface DeckWaveSlice {
  low: number;        // 0 to 1 (Bajos rojo caliente)
  mid: number;        // 0 to 1 (Medios intermedios tibios)
  midHigh?: number;   // 0 to 1 (Medios agudos tibios claros)
  high: number;       // 0 to 1 (Agudos claros fríos)
  peakL: number;      // 0 to 1 positive peak
  peakR: number;      // 0 to 1 negative peak
  rms: number;        // root mean square power
  isTransient: boolean;
  dominantColor?: string;
}

export interface ColorScheme {
  id: ColorSchemeId;
  name: string;
  tagline?: string;
  background: string;
  gridLine: string;
  textMuted: string;
  lowBand: string;          // Bajos rojo caliente
  midBand: string;          // Medios intermedios tibios
  midHighBand?: string;     // Medios agudos tibios claros
  highBand: string;         // Agudos claros fríos
  waveformL: string;
  waveformR: string;
  transient: string;
  peakHold: string;
  stereoIndicator: string;
  gradientSpectrum: [number, string][];
}

export interface BpmState {
  bpm: number;           // Detected BPM (e.g. 124.0), 0 if none yet
  confidence: number;    // 0.0 to 1.0 (tempo stability confidence)
  isBeat: boolean;       // True on current beat frame
  beatPulse: number;     // 0.0 to 1.0 decaying flash for visual pulsing
  bpmStable: boolean;    // True if consistent tempo detected
}

export interface VisualizerConfig {
  mode: VisualizerMode;
  colorScheme: ColorSchemeId;
  height: number;
  decayRate: number;        // dB/sec decay for peak hold & spectrum
  smoothing: number;        // 0.0 - 0.95
  waveformStyle: 'scrolling' | 'center-mirror' | 'stereo-split';
  waveformShape?: WaveformShape; // 'smooth-curves' (organic spline contours) or 'rounded-bars' (pill capsules)
  showStereometer: boolean;
  showFrequencyGrid: boolean;
  selectedBandHz: number | null; // For click-to-inspect frequency
  scrollSpeed?: number;     // Pixels per second for scrolling waveform
  showPeakHold?: boolean;   // Show horizontal peak-hold tick lines on each band with slow decay
  peakHoldDecay?: 'slow' | 'medium' | 'fast'; // Decay speed of peak hold lines
  showBpmOverlay?: boolean; // Show transparent BPM detector in bottom-right corner
  showBeatCenterLine?: boolean; // Show center vertical line & pulsing point for BPM detection
}
