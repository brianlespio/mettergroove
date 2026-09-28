import type { AudioFrameData } from '../types/audio';

/**
 * Normalized analysis snapshot shared by every visualization engine.
 * Band values are 0..1. The `frame` reference points at AudioEngine buffers
 * and is only valid until the next getFrameData() call.
 */
export interface AudioAnalysisData {
  time: number;
  deltaTime: number;
  waveform: Float32Array;
  fft: Uint8Array;
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  treble: number;
  rms: number;
  amplitude: number;
  beat: boolean;
  beatStrength: number;
  bpm: number;
  demoSource: boolean;
  frame: AudioFrameData;
}

export function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
