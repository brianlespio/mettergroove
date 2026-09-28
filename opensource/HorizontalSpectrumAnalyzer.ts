/**
 * Open Source Horizontal Spectrum & DJ Deck Audio Analyzer
 * 
 * Standalone, high-efficiency real-time analysis engine for DJ software decks.
 * Decomposes stereo audio into:
 * 1. Perceptual logarithmic horizontal frequency spectrum (20Hz - 20kHz).
 * 2. 3-band energy isolation (Low / Mid / High) for RGB multi-band waveforms.
 * 3. Stereo field metrics (phase correlation, balance, mid/side power, width).
 * 4. Transient detection for beat markers and cue triggers.
 * 
 * Zero external dependencies. Works in Web Audio API environments, Electron DJ apps,
 * and audio worklets.
 * 
 * @license MIT
 */

import {
  AnalyzerConfig,
  DeckAnalysisResult,
  DeckFrequencyBands,
  DeckWaveSlice,
  SpectrumPoint,
  StereoDeckMetrics,
} from './types';

export class HorizontalSpectrumAnalyzer {
  private audioContext: AudioContext;
  private inputNode: AudioNode | null = null;
  private splitterNode: ChannelSplitterNode | null = null;
  private analyserL: AnalyserNode;
  private analyserR: AnalyserNode;

  // Configuration
  public readonly fftSize: number;
  public readonly lowCrossoverHz: number;
  public readonly highCrossoverHz: number;
  public readonly minFrequencyHz: number;
  public readonly maxFrequencyHz: number;
  public readonly horizontalPoints: number;
  public readonly smoothingTimeConstant: number;
  public readonly peakDecayRate: number;
  public readonly peakHoldDuration: number;

  // Frequency buffers (raw Uint8Array from AnalyserNode)
  private freqBufferL: Uint8Array;
  private freqBufferR: Uint8Array;
  private timeBufferL: Float32Array;
  private timeBufferR: Float32Array;

  // Smoothed spectrum state
  private smoothedMagnitudes: Float32Array;
  private peakHoldMagnitudes: Float32Array;
  private peakHoldTimers: Float32Array;
  private peakHoldVelocities: Float32Array;

  // Smoothed band energies
  private smoothedBands: DeckFrequencyBands = { low: 0, mid: 0, high: 0 };
  private smoothedStereo: StereoDeckMetrics = {
    balance: 0,
    correlation: 1,
    midPower: 0,
    sidePower: 0,
    width: 0,
    rmsL: 0,
    rmsR: 0,
    peakL: 0,
    peakR: 0,
  };

  // Transient detection state
  private previousEnergy = 0;
  private transientIntensity = 0;
  private lastAnalysisTime = 0;

  constructor(context: AudioContext, config: AnalyzerConfig = {}) {
    this.audioContext = context;
    this.fftSize = config.fftSize ?? 2048;
    this.lowCrossoverHz = config.lowCrossoverHz ?? 250;
    this.highCrossoverHz = config.highCrossoverHz ?? 4000;
    this.minFrequencyHz = config.minFrequencyHz ?? 20;
    this.maxFrequencyHz = config.maxFrequencyHz ?? 20000;
    this.horizontalPoints = config.horizontalPoints ?? 128;
    this.smoothingTimeConstant = config.smoothingTimeConstant ?? 0.65;
    this.peakDecayRate = config.peakDecayRate ?? 1.2;
    this.peakHoldDuration = config.peakHoldDuration ?? 0.5;

    // Create dual FFT analysers for stereo inspection
    this.analyserL = this.audioContext.createAnalyser();
    this.analyserL.fftSize = this.fftSize;
    this.analyserL.smoothingTimeConstant = 0.0; // We handle custom asymmetric ballistics

    this.analyserR = this.audioContext.createAnalyser();
    this.analyserR.fftSize = this.fftSize;
    this.analyserR.smoothingTimeConstant = 0.0;

    const binCount = this.analyserL.frequencyBinCount;
    this.freqBufferL = new Uint8Array(binCount);
    this.freqBufferR = new Uint8Array(binCount);
    this.timeBufferL = new Float32Array(this.fftSize);
    this.timeBufferR = new Float32Array(this.fftSize);

    this.smoothedMagnitudes = new Float32Array(this.horizontalPoints);
    this.peakHoldMagnitudes = new Float32Array(this.horizontalPoints);
    this.peakHoldTimers = new Float32Array(this.horizontalPoints);
    this.peakHoldVelocities = new Float32Array(this.horizontalPoints);
  }

  /**
   * Connects an audio source node (e.g. deck player, track gain, or bus) to the analyzer.
   */
  public connect(sourceNode: AudioNode): void {
    if (this.inputNode) {
      this.disconnect();
    }

    this.inputNode = sourceNode;
    this.splitterNode = this.audioContext.createChannelSplitter(2);

    this.inputNode.connect(this.splitterNode);
    this.splitterNode.connect(this.analyserL, 0); // Left channel
    this.splitterNode.connect(this.analyserR, 1); // Right channel
  }

  /**
   * Disconnects the analyzer from the current audio node.
   */
  public disconnect(): void {
    if (this.splitterNode) {
      try {
        if (this.inputNode) {
          this.inputNode.disconnect(this.splitterNode);
        }
        this.splitterNode.disconnect(this.analyserL, 0);
        this.splitterNode.disconnect(this.analyserR, 1);
      } catch {
        // Safe disconnect
      }
      this.splitterNode = null;
    }
    this.inputNode = null;
  }

  /**
   * Runs real-time frame analysis and returns a complete deck analysis result.
   * Call this on every visual frame (e.g. inside requestAnimationFrame).
   * 
   * @param deltaSeconds Elapsed time since previous call in seconds. If omitted, calculated automatically.
   */
  public analyze(deltaSeconds?: number): DeckAnalysisResult {
    const now = performance.now();
    const dt = deltaSeconds !== undefined && deltaSeconds > 0
      ? deltaSeconds
      : Math.min(0.1, Math.max(0.001, (now - (this.lastAnalysisTime || now)) / 1000));
    this.lastAnalysisTime = now;

    // 1. Fetch raw data from Web Audio nodes
    this.analyserL.getByteFrequencyData(this.freqBufferL as any);
    this.analyserR.getByteFrequencyData(this.freqBufferR as any);
    this.analyserL.getFloatTimeDomainData(this.timeBufferL as any);
    this.analyserR.getFloatTimeDomainData(this.timeBufferR as any);

    const sampleRate = this.audioContext.sampleRate;
    const nyquist = sampleRate / 2;
    const binCount = this.analyserL.frequencyBinCount;
    const hzPerBin = nyquist / binCount;

    // 2. Multi-band energy calculation (Low / Mid / High)
    const lowBinEnd = Math.min(binCount - 1, Math.floor(this.lowCrossoverHz / hzPerBin));
    const midBinEnd = Math.min(binCount - 1, Math.floor(this.highCrossoverHz / hzPerBin));

    let sumLow = 0;
    let countLow = 0;
    let sumMid = 0;
    let countMid = 0;
    let sumHigh = 0;
    let countHigh = 0;

    for (let i = 1; i < binCount; i++) {
      // Average L and R frequency amplitude
      const val = (this.freqBufferL[i] + this.freqBufferR[i]) * 0.5 / 255.0;
      if (i <= lowBinEnd) {
        sumLow += val * val;
        countLow++;
      } else if (i <= midBinEnd) {
        sumMid += val * val;
        countMid++;
      } else {
        sumHigh += val * val;
        countHigh++;
      }
    }

    const instantLow = countLow > 0 ? Math.sqrt(sumLow / countLow) : 0;
    const instantMid = countMid > 0 ? Math.sqrt(sumMid / countMid) : 0;
    const instantHigh = countHigh > 0 ? Math.sqrt(sumHigh / countHigh) : 0;

    // Smooth bands with fast attack, smooth decay
    const bandSmoothAlpha = 1.0 - Math.pow(this.smoothingTimeConstant, dt * 60);
    this.smoothedBands.low += (instantLow - this.smoothedBands.low) * bandSmoothAlpha;
    this.smoothedBands.mid += (instantMid - this.smoothedBands.mid) * bandSmoothAlpha;
    this.smoothedBands.high += (instantHigh - this.smoothedBands.high) * bandSmoothAlpha;

    // 3. Stereo Field Metrics & Phase Correlation
    let sumSqL = 0;
    let sumSqR = 0;
    let sumLR = 0;
    let peakL = 0;
    let peakR = 0;
    const timeLen = this.timeBufferL.length;

    for (let i = 0; i < timeLen; i++) {
      const l = this.timeBufferL[i];
      const r = this.timeBufferR[i];
      sumSqL += l * l;
      sumSqR += r * r;
      sumLR += l * r;
      const absL = Math.abs(l);
      const absR = Math.abs(r);
      if (absL > peakL) peakL = absL;
      if (absR > peakR) peakR = absR;
    }

    const rmsL = Math.sqrt(sumSqL / timeLen);
    const rmsR = Math.sqrt(sumSqR / timeLen);
    const denom = Math.sqrt(sumSqL * sumSqR);
    const correlation = denom > 1e-6 ? Math.max(-1, Math.min(1, sumLR / denom)) : 1.0;
    const balance = (rmsL + rmsR) > 1e-5 ? (rmsR - rmsL) / (rmsL + rmsR) : 0;

    // Mid/Side matrix
    const midPower = (rmsL + rmsR) * 0.7071;
    const sidePower = Math.abs(rmsL - rmsR) * 0.7071;
    const width = midPower > 1e-5 ? sidePower / midPower : 0;

    const stereoSmoothAlpha = 1.0 - Math.pow(0.5, dt * 60);
    this.smoothedStereo.rmsL += (rmsL - this.smoothedStereo.rmsL) * stereoSmoothAlpha;
    this.smoothedStereo.rmsR += (rmsR - this.smoothedStereo.rmsR) * stereoSmoothAlpha;
    this.smoothedStereo.peakL = Math.max(peakL, this.smoothedStereo.peakL - dt * 2.0);
    this.smoothedStereo.peakR = Math.max(peakR, this.smoothedStereo.peakR - dt * 2.0);
    this.smoothedStereo.correlation += (correlation - this.smoothedStereo.correlation) * stereoSmoothAlpha;
    this.smoothedStereo.balance += (balance - this.smoothedStereo.balance) * stereoSmoothAlpha;
    this.smoothedStereo.midPower += (midPower - this.smoothedStereo.midPower) * stereoSmoothAlpha;
    this.smoothedStereo.sidePower += (sidePower - this.smoothedStereo.sidePower) * stereoSmoothAlpha;
    this.smoothedStereo.width += (width - this.smoothedStereo.width) * stereoSmoothAlpha;

    // 4. Transient Attack Detection
    const instantTotalEnergy = (rmsL + rmsR) * 0.5;
    const diff = instantTotalEnergy - this.previousEnergy;
    let isTransient = false;
    if (diff > 0.08) {
      this.transientIntensity = Math.min(1.0, this.transientIntensity + diff * 4.0);
      isTransient = true;
    } else {
      this.transientIntensity = Math.max(0, this.transientIntensity - dt * 4.5);
    }
    this.previousEnergy = instantTotalEnergy;

    // 5. Horizontal Logarithmic Spectrum Interpolation
    const minLog = Math.log10(this.minFrequencyHz);
    const maxLog = Math.log10(Math.min(this.maxFrequencyHz, nyquist));
    const spectrumPoints: SpectrumPoint[] = [];

    const attackAlpha = Math.min(1.0, (1.0 - Math.pow(this.smoothingTimeConstant, dt * 60)) * 2.8);
    const decayStep = this.peakDecayRate * dt;

    for (let p = 0; p < this.horizontalPoints; p++) {
      const normalizedX = p / (this.horizontalPoints - 1);
      const freqHz = Math.pow(10, minLog + normalizedX * (maxLog - minLog));
      const binIdxFloat = freqHz / hzPerBin;

      // Linear interpolation between adjacent FFT bins
      const bin0 = Math.max(0, Math.min(binCount - 2, Math.floor(binIdxFloat)));
      const frac = binIdxFloat - bin0;
      const mag0 = (this.freqBufferL[bin0] + this.freqBufferR[bin0]) * 0.5 / 255.0;
      const mag1 = (this.freqBufferL[bin0 + 1] + this.freqBufferR[bin0 + 1]) * 0.5 / 255.0;
      const rawMag = mag0 + frac * (mag1 - mag0);

      // Asymmetric smoothing
      const current = this.smoothedMagnitudes[p];
      let smoothed: number;
      if (rawMag >= current) {
        smoothed = current + (rawMag - current) * attackAlpha;
      } else {
        smoothed = Math.max(0, current - (current - rawMag) * attackAlpha * 0.35);
      }
      this.smoothedMagnitudes[p] = smoothed;

      // Peak hold ballistics
      if (smoothed >= this.peakHoldMagnitudes[p]) {
        this.peakHoldMagnitudes[p] = smoothed;
        this.peakHoldTimers[p] = 0;
        this.peakHoldVelocities[p] = 0;
      } else {
        this.peakHoldTimers[p] += dt;
        if (this.peakHoldTimers[p] >= this.peakHoldDuration) {
          // Physics gravity descent
          this.peakHoldVelocities[p] += 2.2 * dt;
          this.peakHoldMagnitudes[p] = Math.max(
            smoothed,
            this.peakHoldMagnitudes[p] - (decayStep + this.peakHoldVelocities[p] * dt)
          );
        }
      }

      // Convert magnitude to decibels (-60 dB to 0 dB range)
      const db = smoothed > 1e-4 ? 20 * Math.log10(smoothed) : -60;

      spectrumPoints.push({
        normalizedX,
        frequencyHz: Math.round(freqHz),
        magnitude: smoothed,
        db: Math.max(-60, Math.min(0, db)),
        peakHold: this.peakHoldMagnitudes[p],
      });
    }

    // 6. Create Deck Wave Slice for scrolling timeline buffers
    const waveSlice: DeckWaveSlice = {
      low: Math.min(1.0, this.smoothedBands.low * 1.35),
      mid: Math.min(1.0, this.smoothedBands.mid * 1.2),
      high: Math.min(1.0, this.smoothedBands.high * 1.5),
      peakL,
      peakR,
      rms: (rmsL + rmsR) * 0.5,
      isTransient,
    };

    return {
      timestamp: now,
      sampleRate,
      bands: { ...this.smoothedBands },
      stereo: { ...this.smoothedStereo },
      spectrum: spectrumPoints,
      waveSlice,
      transientIntensity: this.transientIntensity,
    };
  }

  /**
   * Helper to retrieve isolated tri-band energy immediately without full spectrum generation.
   */
  public getTriBandEnergy(): DeckFrequencyBands {
    return { ...this.smoothedBands };
  }

  /**
   * Helper to retrieve current stereo field metrics.
   */
  public getStereoMetrics(): StereoDeckMetrics {
    return { ...this.smoothedStereo };
  }
}
