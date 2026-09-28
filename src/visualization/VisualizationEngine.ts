import type { AudioAnalysisData } from '../audio/AudioAnalysisData';
import type { VisualizationFamily } from './types';

/**
 * Contract shared by every visual backend.
 * Engines must release GPU resources in dispose() and must not own the AudioContext.
 */
export interface VisualizationEngine {
  readonly kind: VisualizationFamily;
  resize(width: number, height: number, devicePixelRatio: number): void;
  render(analysis: AudioAnalysisData): void;
  dispose(): void;
}
