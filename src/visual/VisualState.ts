import { AudioFrameData, StereoMetrics, BandEnergies, DeckWaveSlice, BpmState } from '../types/audio';
import { BpmDetector } from '../audio/BpmDetector';
import { classifySoundElement } from './frequencyColors';

export class VisualState {
  // Spectrum Peak hold buffer & smoothed bins
  public smoothedSpectrum: Float32Array;
  public peakHoldSpectrum: Float32Array;
  public peakHoldAges: Float32Array;
  public peakVelocities: Float32Array;

  // Real-time BPM tracking
  public bpmDetector: BpmDetector;
  public bpmState: BpmState = {
    bpm: 0,
    confidence: 0,
    isBeat: false,
    beatPulse: 0,
    bpmStable: false,
  };

  // Smoothed metrics
  public smoothedMetrics: StereoMetrics = {
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

  public smoothedBands: BandEnergies = {
    low: 0,
    mid: 0,
    midHigh: 0,
    high: 0,
  };

  // DJ Deck Multi-Band Rolling Timeline Buffer (Expanded to 2048 for high pixel density)
  public readonly historyLength = 2048;
  public timelineSlices: DeckWaveSlice[];
  public timelineWriteIndex = 0;
  public totalSlicesRecorded = 0;

  // Sub-pixel scroll accumulator
  public scrollProgress = 0;

  // Transient detection & flash
  private previousEnergy = 0;
  public transientFlash = 0; // 0 to 1

  constructor(numBins = 1024) {
    this.smoothedSpectrum = new Float32Array(numBins);
    this.peakHoldSpectrum = new Float32Array(numBins);
    this.peakHoldAges = new Float32Array(numBins);
    this.peakVelocities = new Float32Array(numBins);
    this.bpmDetector = new BpmDetector();

    // Initialize circular buffer for Deck multi-band waveform
    this.timelineSlices = new Array(this.historyLength);
    for (let i = 0; i < this.historyLength; i++) {
      this.timelineSlices[i] = {
        low: 0,
        mid: 0,
        midHigh: 0,
        high: 0,
        peakL: 0,
        peakR: 0,
        rms: 0,
        isTransient: false,
        dominantColor: '#FF1E27',
      };
    }
  }

  public update(
    frame: AudioFrameData,
    deltaSeconds: number,
    smoothingFactor = 0.65,
    peakDecayMode: 'slow' | 'medium' | 'fast' = 'slow',
    isDemoSource = false
  ): void {
    const numBins = Math.min(frame.frequencyL.length, this.smoothedSpectrum.length);
    // Smooth factor calibrated for 60fps frame rate
    const alpha = 1.0 - Math.pow(smoothingFactor, deltaSeconds * 60);

    // Peak Hold parameters: hold duration and gravity acceleration
    let holdDuration = 0.65; // seconds
    let gravity = 180;       // px/sec^2
    if (peakDecayMode === 'medium') {
      holdDuration = 0.40;
      gravity = 350;
    } else if (peakDecayMode === 'fast') {
      holdDuration = 0.20;
      gravity = 550;
    }

    // 1. Asymmetric smoothing for Spectrum (Fast Attack, Silky Exponential Decay)
    const attackAlpha = Math.min(1.0, alpha * 2.8);
    const decaySpeed = (200 * (1.05 - smoothingFactor * 0.7)) * deltaSeconds;

    for (let i = 0; i < numBins; i++) {
      const rawMag = (frame.frequencyL[i] + frame.frequencyR[i]) * 0.5;

      if (rawMag > this.smoothedSpectrum[i]) {
        // Snappy rise on transients
        this.smoothedSpectrum[i] += (rawMag - this.smoothedSpectrum[i]) * attackAlpha;
      } else {
        // Silky exponential descent
        this.smoothedSpectrum[i] = Math.max(0, this.smoothedSpectrum[i] - decaySpeed * 0.85);
      }

      // Peak hold logic with realistic physical gravity drop
      if (rawMag >= this.peakHoldSpectrum[i]) {
        this.peakHoldSpectrum[i] = rawMag;
        this.peakHoldAges[i] = 0;
        this.peakVelocities[i] = 0;
      } else {
        this.peakHoldAges[i] += deltaSeconds;
        if (this.peakHoldAges[i] > holdDuration) {
          // Release with gradual gentle gravity acceleration (slow decay)
          this.peakVelocities[i] += gravity * deltaSeconds;
          this.peakHoldSpectrum[i] = Math.max(
            this.smoothedSpectrum[i],
            this.peakHoldSpectrum[i] - this.peakVelocities[i] * deltaSeconds
          );
        }
      }
    }

    // 2. Smooth Stereo Metrics
    const m = frame.metrics;
    this.smoothedMetrics.balance += (m.balance - this.smoothedMetrics.balance) * (alpha * 1.8);
    this.smoothedMetrics.correlation += (m.correlation - this.smoothedMetrics.correlation) * (alpha * 1.4);
    this.smoothedMetrics.width += (m.width - this.smoothedMetrics.width) * (alpha * 1.8);
    this.smoothedMetrics.rmsL += (m.rmsL - this.smoothedMetrics.rmsL) * (alpha * 2.5);
    this.smoothedMetrics.rmsR += (m.rmsR - this.smoothedMetrics.rmsR) * (alpha * 2.5);
    this.smoothedMetrics.peakL = Math.max(m.peakL, this.smoothedMetrics.peakL - deltaSeconds * 1.4);
    this.smoothedMetrics.peakR = Math.max(m.peakR, this.smoothedMetrics.peakR - deltaSeconds * 1.4);

    // 3. Smooth Band Energies
    const b = frame.bands;
    this.smoothedBands.low += (b.low - this.smoothedBands.low) * (alpha * 2.2);
    this.smoothedBands.mid += (b.mid - this.smoothedBands.mid) * (alpha * 2.2);
    const bMidHigh = b.midHigh ?? (b.mid * 0.4 + b.high * 0.6);
    this.smoothedBands.midHigh = (this.smoothedBands.midHigh ?? 0) + (bMidHigh - (this.smoothedBands.midHigh ?? 0)) * (alpha * 2.2);
    this.smoothedBands.high += (b.high - this.smoothedBands.high) * (alpha * 2.2);

    // 4. Transient & Real-Time BPM / Beat Tracking
    const instantEnergy = (m.rmsL + m.rmsR) * 0.5;
    const diff = instantEnergy - this.previousEnergy;
    let isTransientDetected = false;
    if (diff > 0.075) {
      this.transientFlash = Math.min(1.0, this.transientFlash + diff * 4.0);
      isTransientDetected = true;
    } else {
      this.transientFlash = Math.max(0, this.transientFlash - deltaSeconds * 4.5);
    }
    this.previousEnergy = instantEnergy;

    // Process real-time BPM detection
    this.bpmState = this.bpmDetector.process(
      b.low,
      instantEnergy,
      deltaSeconds,
      isDemoSource
    );

    // 5. Append new Slices to the DJ Deck Scrolling Waveform History
    const tdL = frame.timeDomainL;
    const tdR = frame.timeDomainR;
    const len = tdL.length;

    // Instantaneous overall peak check for activity gating
    let globalPeak = 0;
    const stepCheck = Math.max(1, Math.floor(len / 64));
    for (let j = 0; j < len; j += stepCheck) {
      const v = Math.max(Math.abs(tdL[j]), Math.abs(tdR[j]));
      if (v > globalPeak) globalPeak = v;
    }

    // When audio is silent or stopped, do not scroll the waveform or advance timeline slices
    const isAudioActive = ((m.rmsL + m.rmsR) > 0.0004 || globalPeak > 0.0015);
    if (!isAudioActive) {
      return;
    }

    // Instantaneous frequency bands with crisp dynamic response for transient events
    const instLow = b.low * 1.4;
    const instMid = b.mid * 1.3;
    const instMidHigh = (b.midHigh ?? (b.mid * 0.4 + b.high * 0.6)) * 1.35;
    const instHigh = b.high * 1.55;

    // High sampling density: record 2-4 timeline slices per frame to achieve fine waveform detail
    const slicesToRecord = Math.max(2, Math.min(4, Math.round(deltaSeconds * 90)));
    const segSize = Math.floor(len / slicesToRecord);

    for (let s = 0; s < slicesToRecord; s++) {
      // Sample true micro-envelope within this slice's specific chronological sub-window
      const startIdx = s * segSize;
      const endIdx = Math.min(len, (s + 1) * segSize);
      let subPeakL = 0;
      let subPeakR = 0;
      const subStep = Math.max(1, Math.floor((endIdx - startIdx) / 32));

      for (let j = startIdx; j < endIdx; j += subStep) {
        const vL = Math.abs(tdL[j]);
        const vR = Math.abs(tdR[j]);
        if (vL > subPeakL) subPeakL = vL;
        if (vR > subPeakR) subPeakR = vR;
      }

      const segPeak = Math.min(1.0, Math.max(subPeakL, subPeakR));

      const slice = this.timelineSlices[this.timelineWriteIndex];
      slice.low = Math.min(1.0, instLow * 0.75 + this.smoothedBands.low * 0.25);
      slice.mid = Math.min(1.0, instMid * 0.75 + this.smoothedBands.mid * 0.25);
      slice.midHigh = Math.min(1.0, instMidHigh * 0.75 + (this.smoothedBands.midHigh ?? 0) * 0.25);
      slice.high = Math.min(1.0, instHigh * 0.75 + this.smoothedBands.high * 0.25);
      slice.peakL = segPeak;
      slice.peakR = segPeak;
      slice.rms = (m.rmsL + m.rmsR) * 0.5;
      slice.isTransient = isTransientDetected && s === 0;

      // Classify the distinct sound element for this slice:
      // Kicks/Bass -> Fiery Hot Red (#FF1E27)
      // Hi-Hats/Cymbals -> Electric Ice Cyan (#00E5FF)
      // Snares/Claps -> Warm Bright Lime (#84CC16)
      // Vocals/Synths -> Warm Tangerine Orange (#F97316)
      const sound = classifySoundElement(
        slice.low,
        slice.mid,
        slice.midHigh ?? (slice.mid * 0.5 + slice.high * 0.5),
        slice.high,
        slice.isTransient
      );
      slice.dominantColor = sound.color;

      this.timelineWriteIndex = (this.timelineWriteIndex + 1) % this.historyLength;
      this.totalSlicesRecorded++;
    }

    // Update smooth sub-pixel scroll offset
    this.scrollProgress = (this.scrollProgress + deltaSeconds * 60) % this.historyLength;
  }

  /**
   * Retrieves a slice from the rolling timeline buffer, where index 0 is the newest (live) slice,
   * and index (historyLength - 1) is the oldest slice.
   */
  public getSlice(offsetFromNewest: number): DeckWaveSlice {
    const clampedOffset = Math.max(0, Math.min(this.historyLength - 1, Math.floor(offsetFromNewest)));
    let idx = this.timelineWriteIndex - 1 - clampedOffset;
    while (idx < 0) idx += this.historyLength;
    return this.timelineSlices[idx % this.historyLength];
  }

  /**
   * Retrieves an interpolated slice using smoothstep interpolation between adjacent slices.
   * Completely eliminates square/pixelated stair steps and delivers a fluid, high-resolution curve.
   */
  public getInterpolatedSlice(offset: number): DeckWaveSlice {
    const clampedOffset = Math.max(0, Math.min(this.historyLength - 2, offset));
    const idx0 = Math.floor(clampedOffset);
    const frac = clampedOffset - idx0;
    // Smoothstep interpolation (3t^2 - 2t^3)
    const t = frac * frac * (3 - 2 * frac);

    const s0 = this.getSlice(idx0);
    const s1 = this.getSlice(idx0 + 1);

    return {
      peakL: s0.peakL * (1 - t) + s1.peakL * t,
      peakR: s0.peakR * (1 - t) + s1.peakR * t,
      low: s0.low * (1 - t) + s1.low * t,
      mid: s0.mid * (1 - t) + s1.mid * t,
      midHigh: (s0.midHigh ?? 0) * (1 - t) + (s1.midHigh ?? 0) * t,
      high: s0.high * (1 - t) + s1.high * t,
      rms: s0.rms * (1 - t) + s1.rms * t,
      isTransient: s0.isTransient || (s1.isTransient && frac > 0.5),
      dominantColor: frac < 0.5 ? s0.dominantColor : s1.dominantColor,
    };
  }
}
