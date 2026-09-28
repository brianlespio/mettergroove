export interface PerformanceSample {
  fps: number;
  frameTimeMs: number;
  audioMs: number;
  presetLoadMs: number;
  renderer: string;
}

/** Development counters. No per-frame allocation. */
export class PerformanceMonitor {
  fps = 0;
  frameTimeMs = 0;
  audioMs = 0;
  presetLoadMs = 0;
  renderer = 'idle';

  private frames = 0;
  private windowSeconds = 0;

  sample(deltaSeconds: number, audioMs: number): void {
    this.frameTimeMs = deltaSeconds * 1000;
    this.audioMs = audioMs;
    this.windowSeconds += deltaSeconds;
    this.frames += 1;
    if (this.windowSeconds >= 0.5) {
      this.fps = this.frames / this.windowSeconds;
      this.frames = 0;
      this.windowSeconds = 0;
    }
  }

  snapshot(): PerformanceSample {
    return {
      fps: this.fps,
      frameTimeMs: this.frameTimeMs,
      audioMs: this.audioMs,
      presetLoadMs: this.presetLoadMs,
      renderer: this.renderer,
    };
  }
}
