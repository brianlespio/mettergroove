import { BpmDetector } from './BpmDetector';
import { AudioAnalysisData, clamp01 } from './AudioAnalysisData';
import type { AudioFrameData } from '../types/audio';

interface BandSums {
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  treble: number;
}

/**
 * Independent analysis layer. It reads the existing AudioEngine frame and
 * does not create another AudioContext or AnalyserNode.
 */
export class AudioAnalysisBus {
  private readonly bpm = new BpmDetector();
  private waveform = new Float32Array(2048);
  private fft = new Uint8Array(1024);
  private readonly data: AudioAnalysisData;

  constructor() {
    const empty = new Float32Array(0);
    const emptyFft = new Uint8Array(0);
    this.data = {
      time: 0,
      deltaTime: 0,
      waveform: this.waveform,
      fft: this.fft,
      bass: 0,
      lowMid: 0,
      mid: 0,
      highMid: 0,
      treble: 0,
      rms: 0,
      amplitude: 0,
      beat: false,
      beatStrength: 0,
      bpm: 0,
      demoSource: false,
      frame: {
        timeDomainL: empty,
        timeDomainR: empty,
        frequencyL: emptyFft,
        frequencyR: emptyFft,
        sampleRate: 48000,
        fftSize: 2048,
        metrics: {
          balance: 0,
          correlation: 1,
          midPower: 0,
          sidePower: 0,
          width: 0,
          rmsL: 0,
          rmsR: 0,
          peakL: 0,
          peakR: 0,
        },
        bands: { low: 0, mid: 0, high: 0 },
      },
    };
  }

  reset(): void {
    this.bpm.reset();
  }

  /** Updates the reused snapshot in place. */
  update(frame: AudioFrameData, deltaTime: number, demoSource = false): AudioAnalysisData {
    this.ensureSizes(frame);
    this.mixWaveform(frame);
    this.mixFft(frame);
    const bands = energyBands(frame, this.fft);
    const rms = clamp01((frame.metrics.rmsL + frame.metrics.rmsR) * 0.5);
    const amplitude = clamp01(Math.max(rms, (frame.metrics.peakL + frame.metrics.peakR) * 0.5));
    const beatState = this.bpm.process(bands.bass, Math.max(rms, amplitude), deltaTime, demoSource);

    const snapshot = this.data;
    snapshot.time = performance.now() / 1000;
    snapshot.deltaTime = deltaTime;
    snapshot.waveform = this.waveform;
    snapshot.fft = this.fft;
    snapshot.bass = bands.bass;
    snapshot.lowMid = bands.lowMid;
    snapshot.mid = bands.mid;
    snapshot.highMid = bands.highMid;
    snapshot.treble = bands.treble;
    snapshot.rms = rms;
    snapshot.amplitude = amplitude;
    snapshot.beat = beatState.isBeat;
    snapshot.beatStrength = clamp01(beatState.beatPulse);
    snapshot.bpm = beatState.bpm;
    snapshot.demoSource = demoSource;
    snapshot.frame = frame;
    return snapshot;
  }

  private ensureSizes(frame: AudioFrameData): void {
    const waveLength = frame.timeDomainL.length;
    if (this.waveform.length !== waveLength) this.waveform = new Float32Array(waveLength);
    const fftLength = frame.frequencyL.length;
    if (this.fft.length !== fftLength) this.fft = new Uint8Array(fftLength);
  }

  private mixWaveform(frame: AudioFrameData): void {
    const left = frame.timeDomainL;
    const right = frame.timeDomainR;
    const out = this.waveform;
    for (let i = 0; i < out.length; i++) {
      out[i] = (left[i] + (right[i] || 0)) * 0.5;
    }
  }

  private mixFft(frame: AudioFrameData): void {
    const left = frame.frequencyL;
    const right = frame.frequencyR;
    const out = this.fft;
    for (let i = 0; i < out.length; i++) {
      out[i] = (left[i] + (right[i] || 0)) >> 1;
    }
  }
}

function energyBands(frame: AudioFrameData, fft: Uint8Array): BandSums {
  const binHz = frame.sampleRate / frame.fftSize;
  let bass = 0;
  let bassMax = 0;
  let bassCount = 0;
  let lowMid = 0;
  let lowMidMax = 0;
  let lowMidCount = 0;
  let mid = 0;
  let midMax = 0;
  let midCount = 0;
  let highMid = 0;
  let highMidMax = 0;
  let highMidCount = 0;
  let treble = 0;
  let trebleMax = 0;
  let trebleCount = 0;

  for (let i = 1; i < fft.length; i++) {
    const hz = i * binHz;
    const mag = fft[i];
    if (hz < 20) continue;
    if (hz < 250) {
      bass += mag;
      if (mag > bassMax) bassMax = mag;
      bassCount++;
    } else if (hz < 500) {
      lowMid += mag;
      if (mag > lowMidMax) lowMidMax = mag;
      lowMidCount++;
    } else if (hz < 2000) {
      mid += mag;
      if (mag > midMax) midMax = mag;
      midCount++;
    } else if (hz < 6000) {
      highMid += mag;
      if (mag > highMidMax) highMidMax = mag;
      highMidCount++;
    } else if (hz <= 20000) {
      treble += mag;
      if (mag > trebleMax) trebleMax = mag;
      trebleCount++;
    }
  }

  return {
    bass: normalizeBand(bass, bassMax, bassCount, 1.15),
    lowMid: normalizeBand(lowMid, lowMidMax, lowMidCount, 1.25),
    mid: normalizeBand(mid, midMax, midCount, 1.35),
    highMid: normalizeBand(highMid, highMidMax, highMidCount, 1.65),
    treble: normalizeBand(treble, trebleMax, trebleCount, 2.15),
  };
}

function normalizeBand(sum: number, max: number, count: number, gain: number): number {
  if (count <= 0) return 0;
  const avg = sum / count;
  return clamp01(((avg * 0.65) + (max * 0.35)) / 255 * gain);
}
