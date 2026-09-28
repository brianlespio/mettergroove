import type { AudioAnalysisData } from '../../audio/AudioAnalysisData';

/**
 * MilkDrop / projectM audio variables.
 * bass/mid/treb follow the smoothed levels presets read.
 * *_att is the level divided by its running average (impulse around 1).
 * pcm is the mono waveform in -1..1, the buffer projectM consumes.
 */
export interface MilkdropAudioVariables {
  bass: number;
  mid: number;
  treb: number;
  bassAtt: number;
  midAtt: number;
  trebAtt: number;
  pcm: Float32Array;
}

const SMOOTH = 0.15;

export class AudioAnalysisAdapter {
  private bass = 0;
  private mid = 0;
  private treb = 0;
  private bassAvg = 0.001;
  private midAvg = 0.001;
  private trebAvg = 0.001;
  private pcm = new Float32Array(576);

  reset(): void {
    this.bass = 0;
    this.mid = 0;
    this.treb = 0;
    this.bassAvg = 0.001;
    this.midAvg = 0.001;
    this.trebAvg = 0.001;
    this.pcm.fill(0);
  }

  convert(analysis: AudioAnalysisData): MilkdropAudioVariables {
    this.bass = smooth(this.bass, analysis.bass);
    this.mid = smooth(this.mid, (analysis.lowMid + analysis.mid) * 0.5);
    this.treb = smooth(this.treb, (analysis.highMid * 0.35) + (analysis.treble * 0.65));

    this.bassAvg = smoothAverage(this.bassAvg, this.bass);
    this.midAvg = smoothAverage(this.midAvg, this.mid);
    this.trebAvg = smoothAverage(this.trebAvg, this.treb);

    const source = analysis.waveform;
    const length = this.pcm.length;
    const step = source.length / length;
    for (let i = 0; i < length; i++) {
      const index = Math.min(source.length - 1, Math.floor(i * step));
      this.pcm[i] = source[index] || 0;
    }

    return {
      bass: this.bass,
      mid: this.mid,
      treb: this.treb,
      bassAtt: this.bass / this.bassAvg,
      midAtt: this.mid / this.midAvg,
      trebAtt: this.treb / this.trebAvg,
      pcm: this.pcm,
    };
  }
}

function smooth(previous: number, next: number): number {
  return previous + (next - previous) * SMOOTH;
}

function smoothAverage(previous: number, next: number): number {
  return Math.max(0.001, previous * 0.98 + next * 0.02);
}
