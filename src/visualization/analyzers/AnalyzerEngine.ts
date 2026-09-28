import type { AudioFrameData, VisualizerConfig } from '../../types/audio';
import { VisualizerRenderer } from '../../visual/Renderer';
import { VisualState } from '../../visual/VisualState';
import type { VisualizationEngine } from '../VisualizationEngine';
import type { AudioAnalysisData } from '../../audio/AudioAnalysisData';

/**
 * Existing analyzer stack. Drawing stays in VisualizerRenderer;
 * this class is the mode boundary so other engines can replace it.
 */
export class AnalyzerEngine implements VisualizationEngine {
  readonly kind = 'analyzer' as const;
  readonly visualState: VisualState;
  private renderer: VisualizerRenderer;
  private config: VisualizerConfig | null = null;
  private cursorX: number | null = null;

  constructor(canvas: HTMLCanvasElement, bins = 1024) {
    this.renderer = new VisualizerRenderer(canvas);
    this.visualState = new VisualState(bins);
  }

  get bpmState() {
    return this.visualState.bpmState;
  }

  setPointer(cursorX: number | null): void {
    this.cursorX = cursorX;
  }

  setConfig(config: VisualizerConfig): void {
    this.config = config;
  }

  resize(width: number, height: number): void {
    this.renderer.resize(width, height);
  }

  render(analysis: AudioAnalysisData): void {
    if (!this.config) return;
    this.renderFrame(analysis.frame, analysis.deltaTime, this.config, analysis.demoSource);
  }

  renderFrame(
    frame: AudioFrameData,
    deltaSeconds: number,
    config: VisualizerConfig,
    demoSource: boolean
  ): void {
    this.config = config;
    this.visualState.update(
      frame,
      deltaSeconds,
      config.smoothing,
      config.peakHoldDecay || 'slow',
      demoSource
    );
    this.renderer.render(frame, this.visualState, config, this.cursorX);
  }

  dispose(): void {
    this.config = null;
  }
}
