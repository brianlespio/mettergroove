import { AudioFrameData, VisualizerConfig, ColorScheme, WaveformShape } from '../types/audio';
import { VisualState } from './VisualState';
import { COLOR_SCHEMES } from './colorSchemes';

export class VisualizerRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private meterHoldL = -60;
  private meterHoldR = -60;
  private meterHoldAtL = 0;
  private meterHoldAtR = 0;
  private meterClock = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) {
      throw new Error('Canvas 2D context not supported');
    }
    this.ctx = context;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);

    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  public render(
    frame: AudioFrameData,
    state: VisualState,
    config: VisualizerConfig,
    cursorX: number | null
  ): void {
    const width = this.width;
    const height = this.height;
    if (width <= 0 || height <= 0) return;

    // Auto re-scale if device pixel ratio changed (browser zoom or display DPI change)
    const currentDpr = Math.max(1, window.devicePixelRatio || 1);
    if (Math.abs(currentDpr - this.dpr) > 0.05) {
      this.resize(this.width, this.height);
    }

    const colors = COLOR_SCHEMES[config.colorScheme] || COLOR_SCHEMES.spectrum;

    this.ctx.save();

    // 1. Clear background
    this.ctx.fillStyle = colors.background;
    this.ctx.fillRect(0, 0, width, height);

    // The frequency grid belongs to the spectrum. On the deck waveform it is a
    // time axis, and those vertical lines are what made it look like a grid.
    if (config.showFrequencyGrid && config.mode !== 'waveform') {
      this.drawFluidGrid(width, height, colors, frame.sampleRate, config.mode);
    }

    const shape = config.waveformShape || 'smooth-curves';

    // 3. Render strictly according to selected mode without crossing visuals
    switch (config.mode) {
      case 'waveform':
        // PURE DJ Deck scrolling waveform: completely isolated, NO crossed or mixed visuals
        this.drawDeckWaveform(width, height, state, colors, 'expanded', shape);
        break;

      case 'spectrum':
        // Pure fluid Catmull-Rom spectrum without any floating lines
        if (config.showFrequencyGrid) {
          this.drawFluidGrid(width, height, colors, frame.sampleRate, 'spectrum');
        }
        this.drawFluidSpectrum(width, height, state, colors, frame.sampleRate, 0.88);
        break;

      case 'stereo':
        // Pure dedicated stereo oscilloscope & Lissajous analyzer
        this.drawDedicatedStereometer(width, height, frame, state, colors);
        break;

      case 'levels':
        this.drawLevelMeters(width, height, frame);
        break;

      case 'combined':
      default: {
        const lanes = this.combinedLanes(width);
        const [wave, spectrum, stereo] = lanes;
        this.paintRegion(wave.x, wave.w, height, () => {
          this.drawDeckWaveform(wave.w, height, state, colors, 'expanded', shape);
        });
        this.paintRegion(spectrum.x, spectrum.w, height, () => {
          if (config.showFrequencyGrid) {
            this.drawFluidGrid(spectrum.w, height, colors, frame.sampleRate, 'spectrum');
          }
          this.drawFluidSpectrum(spectrum.w, height, state, colors, frame.sampleRate, 0.88);
        });
        this.paintRegion(stereo.x, stereo.w, height, () => {
          this.drawDedicatedStereometer(stereo.w, height, frame, state, colors);
        });
        const levels = lanes[3];
        this.paintRegion(levels.x, levels.w, height, () => {
          this.drawLevelMeters(levels.w, height, frame);
        });
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        for (const lane of lanes.slice(1)) {
          this.ctx.moveTo(lane.x - 0.5, 0);
          this.ctx.lineTo(lane.x - 0.5, height);
        }
        this.ctx.stroke();
        this.ctx.restore();
        break;
      }
    }

    if (config.showStereometer && config.mode !== 'combined' && config.mode !== 'stereo' && config.mode !== 'levels') {
      this.drawStereometerOverlay(width, height, state, colors);
    }

    // 4. Interactive Cursor Hover Frequency Inspector
    if (cursorX !== null && cursorX >= 0 && cursorX <= width && (config.mode === 'spectrum' || config.mode === 'combined')) {
      if (config.mode === 'combined') {
        const spectrum = this.combinedLanes(width)[1];
        if (cursorX >= spectrum.x && cursorX <= spectrum.x + spectrum.w) {
          this.paintRegion(spectrum.x, spectrum.w, height, () => {
            this.drawFrequencyInspector(spectrum.w, height, cursorX - spectrum.x, state, colors, frame.sampleRate);
          });
        }
      } else {
        this.drawFrequencyInspector(width, height, cursorX, state, colors, frame.sampleRate);
      }
    }

    // Outer subtle border
    this.ctx.strokeStyle = state.transientFlash > 0.08
      ? `rgba(255, 255, 255, ${Math.min(0.4, 0.1 + state.transientFlash * 0.3)})`
      : 'rgba(255, 255, 255, 0.08)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    this.ctx.restore();
  }

  private combinedLanes(width: number): { x: number; w: number }[] {
    const count = 4;
    const gap = 1;
    const laneW = (width - gap * (count - 1)) / count;
    return Array.from({ length: count }, (_, index) => ({ x: index * (laneW + gap), w: laneW }));
  }

  private paintRegion(x: number, w: number, h: number, draw: () => void): void {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, 0, w, h);
    this.ctx.clip();
    this.ctx.translate(x, 0);
    draw();
    this.ctx.restore();
  }

  // ==========================================
  // DJ DECK MULTI-BAND SCROLLING WAVEFORM
  // ==========================================
  private drawDeckWaveform(
    width: number,
    height: number,
    state: VisualState,
    colors: ColorScheme,
    style: 'combined' | 'expanded',
    shape: WaveformShape = 'smooth-curves'
  ): void {
    const centerY = Math.round(height / 2);
    const maxAmplitude = style === 'combined' ? height * 0.44 : height * 0.48;

    this.ctx.save();

    // Subtle center baseline with rounded line ends
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    this.ctx.lineWidth = 1;
    this.ctx.lineCap = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(0, centerY + 0.5);
    this.ctx.lineTo(width, centerY + 0.5);
    this.ctx.stroke();

    // Live audio has no upcoming samples, so the cue sits on the newest one.
    const playheadX = Math.max(8, width - 6);
    const sampleStep = shape === 'smooth-curves' ? 2 : 1.25;
    const points: { x: number; low: number; mid: number; high: number }[] = [];

    for (let x = 0; x <= playheadX; x += sampleStep) {
      const slice = state.getInterpolatedSlice(Math.max(0, playheadX - x));
      const peak = Math.min(1, Math.max(slice.peakL, slice.rms));
      const body = 0.42 + 0.58 * Math.pow(peak, 0.85);
      const band = (value: number, curve: number) => Math.pow(Math.min(1, Math.max(0, value)), curve) * body * maxAmplitude;
      points.push({
        x,
        low: band(slice.low, 1.2),
        mid: band(slice.mid, 1.15),
        high: band(slice.high, 1.05),
      });
    }

    if (points.length >= 2) {
      const alpha = style === 'combined' ? 0.72 : 0.94;
      const ribbon = (key: 'low' | 'mid' | 'high', color: string, edge: number) => {
        const loud = points.some((point) => point[key] > 1.2);
        this.drawSmoothRibbon(
          points.map((point) => ({ x: point.x, yTop: centerY - point[key], yBot: centerY + point[key] })),
          color,
          alpha,
          color,
          loud ? edge : 0,
        );
      };
      ribbon('low', colors.lowBand, 0.35);
      ribbon('mid', colors.midBand, 0.28);
      ribbon('high', colors.highBand, 0.45);
    }

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    this.ctx.lineWidth = 1;
    this.ctx.lineCap = 'round';
    this.ctx.shadowColor = colors.lowBand;
    this.ctx.shadowBlur = 6;
    this.ctx.beginPath();
    this.ctx.moveTo(playheadX, 0);
    this.ctx.lineTo(playheadX, height);
    this.ctx.stroke();
    this.ctx.restore();
    this.ctx.restore();
  }

  /**
   * Catmull-Rom cubic spline continuous ribbon renderer.
   * Eliminates all staircases and rectangular steps for silky smooth high-resolution waveforms.
   */
  private drawSmoothRibbon(
    points: { x: number; yTop: number; yBot: number }[],
    fillColor: string | CanvasGradient,
    fillAlpha: number,
    strokeColor?: string | CanvasGradient,
    strokeAlpha?: number
  ): void {
    if (points.length < 2) return;

    this.ctx.save();
    this.ctx.fillStyle = fillColor;
    this.ctx.globalAlpha = fillAlpha;

    // 1. Draw continuous closed ribbon path
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].yTop);

    // Top curve: left to right
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.yTop + (p2.yTop - p0.yTop) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.yTop + (p3.yTop - p1.yTop) / 6;

      this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.yTop);
    }

    // Connect to bottom right
    const last = points[points.length - 1];
    this.ctx.lineTo(last.x, last.yBot);

    // Bottom curve: right to left
    for (let i = points.length - 1; i > 0; i--) {
      const p0 = points[Math.min(points.length - 1, i + 1)];
      const p1 = points[i];
      const p2 = points[i - 1];
      const p3 = points[Math.max(0, i - 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.yBot + (p2.yBot - p0.yBot) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.yBot + (p3.yBot - p1.yBot) / 6;

      this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.yBot);
    }

    this.ctx.closePath();
    this.ctx.fill();

    // 2. Subtle luminous edge stroke along top and bottom contour
    if (strokeColor && strokeAlpha && strokeAlpha > 0) {
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = 1.0;
      this.ctx.globalAlpha = strokeAlpha;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      // Top contour stroke
      this.ctx.beginPath();
      this.ctx.moveTo(points[0].x, points[0].yTop);
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.yTop + (p2.yTop - p0.yTop) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.yTop + (p3.yTop - p1.yTop) / 6;

        this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.yTop);
      }
      this.ctx.stroke();

      // Bottom contour stroke
      this.ctx.beginPath();
      this.ctx.moveTo(points[0].x, points[0].yBot);
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.yBot + (p2.yBot - p0.yBot) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.yBot + (p3.yBot - p1.yBot) / 6;

        this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.yBot);
      }
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  // ==========================================
  // FLUID CATMULL-ROM LOGARITHMIC SPECTRUM
  // ==========================================
  private drawFluidSpectrum(
    width: number,
    height: number,
    state: VisualState,
    colors: ColorScheme,
    sampleRate: number,
    opacity: number
  ): void {
    const spectrum = state.smoothedSpectrum;
    const binHz = sampleRate / (spectrum.length * 2);

    // Number of control points sampled logarithmically across human hearing
    const numControlPoints = Math.min(96, Math.max(36, Math.floor(width / 16)));
    const points: { x: number; y: number }[] = [];

    const minHz = 20;
    const maxHz = Math.min(20000, sampleRate / 2);
    const minLog = Math.log10(minHz);
    const maxLog = Math.log10(maxHz);

    // Pin left edge at 0, height
    points.push({ x: 0, y: height });

    for (let i = 0; i <= numControlPoints; i++) {
      const frac = i / numControlPoints;
      const x = frac * width;
      const logHz = minLog + frac * (maxLog - minLog);
      const hz = Math.pow(10, logHz);

      const centerBin = hz / binHz;
      const binIdx = Math.min(spectrum.length - 1, Math.max(0, Math.round(centerBin)));

      // Smooth averaging of neighboring bins for liquid curve
      let sumMag = 0;
      let count = 0;
      const spread = Math.max(1, Math.round(binIdx * 0.08));
      const startB = Math.max(0, binIdx - spread);
      const endB = Math.min(spectrum.length - 1, binIdx + spread);

      for (let b = startB; b <= endB; b++) {
        sumMag += spectrum[b];
        count++;
      }

      const avgMag = count > 0 ? sumMag / count : (spectrum[binIdx] || 0);
      const normalized = Math.pow(avgMag / 255, 1.15);
      const y = height - (normalized * (height * 0.94));

      points.push({ x, y });
    }

    // Pin right edge at width, height
    points.push({ x: width, y: height });

    this.ctx.save();
    this.ctx.globalAlpha = opacity;

    // Create multi-stop vertical + horizontal gradient
    const grad = this.ctx.createLinearGradient(0, height, width, 0);
    colors.gradientSpectrum.forEach(([pos, color]) => {
      grad.addColorStop(pos, color);
    });

    // 1. Draw smooth Catmull-Rom spline path
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      // Hermite/Catmull-Rom tangents
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }

    this.ctx.closePath();
    this.ctx.fillStyle = grad;
    this.ctx.fill();

    // 2. Neon Luminous Edge Stroke
    this.ctx.beginPath();
    this.ctx.moveTo(points[1].x, points[1].y);

    for (let i = 1; i < points.length - 2; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }

    this.ctx.strokeStyle = colors.transient;
    this.ctx.lineWidth = 1.8;
    this.ctx.shadowColor = colors.midBand;
    this.ctx.shadowBlur = 8;
    this.ctx.globalAlpha = Math.min(1.0, opacity * 1.3);
    this.ctx.stroke();

    this.ctx.restore();
  }

  // ==========================================
  // FLUID PEAK HOLD DECAY TRAIL (HORIZONTAL LINES)
  // ==========================================
  private drawFluidPeakHold(
    width: number,
    height: number,
    state: VisualState,
    colors: ColorScheme,
    sampleRate: number
  ): void {
    const peakSpectrum = state.peakHoldSpectrum;
    const binHz = sampleRate / (peakSpectrum.length * 2);
    const numPoints = Math.min(84, Math.max(28, Math.floor(width / 16)));
    const bandWidth = width / numPoints;
    const lineWidth = Math.max(6, Math.min(13, bandWidth * 0.72));

    const minHz = 20;
    const maxHz = Math.min(20000, sampleRate / 2);
    const minLog = Math.log10(minHz);
    const maxLog = Math.log10(maxHz);

    this.ctx.save();
    this.ctx.fillStyle = colors.peakHold;
    this.ctx.shadowColor = colors.peakHold;
    this.ctx.shadowBlur = 5;

    for (let i = 0; i <= numPoints; i++) {
      const frac = i / numPoints;
      const x = frac * width;
      const logHz = minLog + frac * (maxLog - minLog);
      const hz = Math.pow(10, logHz);
      const binIdx = Math.min(peakSpectrum.length - 1, Math.max(0, Math.round(hz / binHz)));
      const magByte = peakSpectrum[binIdx] || 0;
      if (magByte < 10) continue;

      const normalized = Math.pow(magByte / 255, 1.15);
      const y = Math.round(height - (normalized * (height * 0.94)));

      // Small horizontal line at the maximum peak of each frequency band
      this.ctx.beginPath();
      this.ctx.roundRect(x - lineWidth / 2, y - 1, lineWidth, 2, 1);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  // ==========================================
  // CENTER BEAT & BPM REFERENCE LINE & POINT
  // ==========================================
  /**
   * Center Beat & BPM Synchronization Reference Line
   * Features a central pulse point ("linea en el medio como punto") that detects
   * and highlights the song tempo / BPM.
   */
  private drawBeatCenterLine(
    width: number,
    height: number,
    state: VisualState,
    colors: ColorScheme
  ): void {
    const centerX = Math.round(width / 2);
    const centerY = Math.round(height / 2);
    const pulse = state.bpmState.beatPulse; // 0.0 to 1.0
    const bpm = state.bpmState.bpm;
    const isStable = state.bpmState.bpmStable;

    this.ctx.save();

    // 1. Vertical Center Line (Red needle pulse matching caliente & frío)
    const lineAlpha = 0.15 + pulse * 0.70;
    this.ctx.strokeStyle = pulse > 0.12 ? '#ff1e27' : 'rgba(255, 255, 255, 0.18)';
    this.ctx.lineWidth = pulse > 0.20 ? 1.5 : 1.0;
    this.ctx.globalAlpha = Math.min(1.0, lineAlpha);
    this.ctx.setLineDash([4, 3]);

    this.ctx.beginPath();
    this.ctx.moveTo(centerX + 0.5, 3);
    this.ctx.lineTo(centerX + 0.5, height - 3);
    this.ctx.stroke();
    this.ctx.setLineDash([]); // Reset dashed style

    // 2. Pulse Radar Ripple Ring when beat hits
    if (pulse > 0.05) {
      const ringRadius = 5 + (1 - pulse) * 18;
      this.ctx.strokeStyle = '#ff1e27';
      this.ctx.lineWidth = 1.3;
      this.ctx.globalAlpha = pulse * 0.90;
      this.ctx.shadowColor = '#ff1e27';
      this.ctx.shadowBlur = 8;
      this.ctx.beginPath();
      this.ctx.arc(centerX + 0.5, centerY + 0.5, ringRadius, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // 3. Center Beat Point ("punto en el medio")
    this.ctx.shadowColor = '#ff1e27';
    this.ctx.shadowBlur = pulse > 0.1 ? 10 : 4;
    this.ctx.fillStyle = pulse > 0.1 ? '#ff1e27' : 'rgba(255, 30, 39, 0.75)';
    this.ctx.globalAlpha = 0.7 + pulse * 0.3;
    this.ctx.beginPath();
    this.ctx.arc(centerX + 0.5, centerY + 0.5, 3.5 + pulse * 1.5, 0, Math.PI * 2);
    this.ctx.fill();

    // Inner bright core
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.globalAlpha = 0.95;
    this.ctx.beginPath();
    this.ctx.arc(centerX + 0.5, centerY + 0.5, 1.5, 0, Math.PI * 2);
    this.ctx.fill();

    // 4. Subtle horizontal tick brackets framing the center point
    this.ctx.strokeStyle = colors.transient;
    this.ctx.lineWidth = 1;
    this.ctx.globalAlpha = 0.25 + pulse * 0.55;
    this.ctx.beginPath();
    this.ctx.moveTo(centerX - 9, centerY + 0.5);
    this.ctx.lineTo(centerX - 5, centerY + 0.5);
    this.ctx.moveTo(centerX + 5, centerY + 0.5);
    this.ctx.lineTo(centerX + 9, centerY + 0.5);
    this.ctx.stroke();

    // 5. Subtle micro tempo tag at top if stable BPM detected
    if (bpm > 0 && height >= 75) {
      this.ctx.font = '9px "JetBrains Mono", monospace, ui-monospace';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'top';
      this.ctx.fillStyle = isStable ? colors.transient : 'rgba(255, 255, 255, 0.65)';
      this.ctx.globalAlpha = isStable ? 0.7 + pulse * 0.3 : 0.45;
      this.ctx.fillText(`BEAT • ${bpm.toFixed(1)}`, centerX, 5);
    }

    this.ctx.restore();
  }

  // ==========================================
  // LOGARITHMIC FREQUENCY & DECIBEL GRID
  // ==========================================
  private drawFluidGrid(
    width: number,
    height: number,
    colors: ColorScheme,
    sampleRate: number,
    mode: string
  ): void {
    const keyFrequencies = [
      { hz: 60, label: '60' },
      { hz: 250, label: '250' },
      { hz: 1000, label: '1k' },
      { hz: 4000, label: '4k' },
      { hz: 12000, label: '12k' },
    ];

    this.ctx.save();
    this.ctx.lineWidth = 1;
    this.ctx.font = '9px "JetBrains Mono", monospace, ui-monospace';
    this.ctx.textAlign = 'center';

    const minHz = 20;
    const maxHz = Math.min(20000, sampleRate / 2);
    const minLog = Math.log10(minHz);
    const maxLog = Math.log10(maxHz);

    // Vertical Frequency Guidelines
    for (const item of keyFrequencies) {
      const logHz = Math.log10(item.hz);
      const x = Math.round(((logHz - minLog) / (maxLog - minLog)) * width);

      this.ctx.strokeStyle = colors.gridLine;
      this.ctx.beginPath();
      this.ctx.moveTo(x + 0.5, 0);
      this.ctx.lineTo(x + 0.5, height);
      this.ctx.stroke();

      if (height >= 85 && mode === 'spectrum') {
        this.ctx.fillStyle = colors.textMuted;
        this.ctx.fillText(item.label, x, height - 4);
      }
    }

    // Horizontal Decibel Lines (in Spectrum mode)
    if (mode === 'spectrum' && height >= 90) {
      const dbMarks = [
        { db: 0, frac: 0.94, label: '0dB' },
        { db: -12, frac: 0.65, label: '-12' },
        { db: -24, frac: 0.40, label: '-24' },
        { db: -48, frac: 0.15, label: '-48' },
      ];

      this.ctx.textAlign = 'left';
      for (const m of dbMarks) {
        const y = Math.round(height - m.frac * (height * 0.94)) + 0.5;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(width, y);
        this.ctx.stroke();

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        this.ctx.fillText(m.label, 4, y - 2);
      }
    }

    this.ctx.restore();
  }

  // ==========================================
  // L / R PEAK METERS IN dBFS
  // ==========================================
  private drawLevelMeters(width: number, height: number, frame: AudioFrameData): void {
    const now = performance.now();
    const dt = this.meterClock === 0 ? 0.016 : Math.min(0.05, (now - this.meterClock) / 1000);
    this.meterClock = now;
    const holdFor = (db: number, hold: number, at: number): { hold: number; at: number } => {
      if (db >= hold) return { hold: db, at: now };
      if (now - at < 1400) return { hold, at };
      return { hold: Math.max(db, hold - dt * 24), at };
    };
    const left = holdFor(this.amplitudeDb(frame.metrics.peakL), this.meterHoldL, this.meterHoldAtL);
    const right = holdFor(this.amplitudeDb(frame.metrics.peakR), this.meterHoldR, this.meterHoldAtR);
    this.meterHoldL = left.hold;
    this.meterHoldAtL = left.at;
    this.meterHoldR = right.hold;
    this.meterHoldAtR = right.at;

    const minDb = -60;
    const padX = 8;
    const labelW = 58;
    const valueW = 0;
    const toolbarClearance = width > 800 ? 230 : 0;
    const scaleH = height >= 70 ? 14 : 0;
    const top = 6 + scaleH;
    const gap = Math.max(4, Math.min(8, height * 0.06));
    const barH = Math.max(8, (height - top - 8 - gap) / 2);
    const x0 = padX + labelW;
    const x1 = Math.max(x0 + 24, width - padX - valueW - toolbarClearance);
    const xOf = (db: number) => x0 + ((Math.max(minDb, Math.min(0, db)) - minDb) / -minDb) * (x1 - x0);
    const marks = x1 - x0 < 180 ? [-24, -12, 0] : [-48, -24, -12, -6, 0];

    this.ctx.save();
    this.ctx.font = '9px "JetBrains Mono", monospace, ui-monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
    if (scaleH > 0) {
      for (const mark of marks) {
        const x = xOf(mark);
        this.ctx.fillText(mark === 0 ? '0' : String(mark), x, 2);
        this.ctx.strokeStyle = mark === 0 ? 'rgba(239, 68, 68, 0.85)' : 'rgba(255, 255, 255, 0.12)';
        this.ctx.beginPath();
        this.ctx.moveTo(x + 0.5, top - 2);
        this.ctx.lineTo(x + 0.5, top + barH * 2 + gap);
        this.ctx.stroke();
      }
    }

    const channels = [
      { label: 'L', peak: frame.metrics.peakL, rms: frame.metrics.rmsL, hold: this.meterHoldL, y: top },
      { label: 'R', peak: frame.metrics.peakR, rms: frame.metrics.rmsR, hold: this.meterHoldR, y: top + barH + gap },
    ];
    const gradient = this.ctx.createLinearGradient(x0, 0, x1, 0);
    gradient.addColorStop(0, '#14532d');
    gradient.addColorStop(((-18 - minDb) / -minDb), '#22c55e');
    gradient.addColorStop(((-12 - minDb) / -minDb), '#eab308');
    gradient.addColorStop(((-6 - minDb) / -minDb), '#f97316');
    gradient.addColorStop(1, '#ef4444');

    for (const channel of channels) {
      const peakDb = this.amplitudeDb(channel.peak);
      const rmsDb = this.amplitudeDb(channel.rms);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      this.ctx.beginPath();
      this.ctx.roundRect(x0, channel.y, x1 - x0, barH, 3);
      this.ctx.fill();

      const peakX = xOf(peakDb);
      if (peakX - x0 > 0.5) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.roundRect(x0, channel.y, peakX - x0, barH, 3);
        this.ctx.clip();
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(x0, channel.y, x1 - x0, barH);
        this.ctx.restore();
      }

      const rmsX = xOf(rmsDb);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      this.ctx.fillRect(x0, channel.y + barH * 0.38, Math.max(0, rmsX - x0), Math.max(2, barH * 0.24));

      const holdX = xOf(channel.hold);
      this.ctx.strokeStyle = channel.hold >= -1 ? '#ff1e27' : '#ffffff';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(holdX, channel.y + 1);
      this.ctx.lineTo(holdX, channel.y + barH - 1);
      this.ctx.stroke();

      this.ctx.fillStyle = peakDb >= -1 ? '#ff1e27' : 'rgba(255, 255, 255, 0.8)';
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(
        `${channel.label} ${peakDb <= -60 ? '-∞' : peakDb.toFixed(1)}`,
        6,
        channel.y + barH / 2,
      );
    }
    this.ctx.restore();
  }

  private amplitudeDb(value: number): number {
    return value <= 1e-5 ? -60 : Math.max(-60, 20 * Math.log10(value));
  }

  // ==========================================
  // FLOATING STEREOMETER OVERLAY
  // ==========================================
  private drawStereometerOverlay(
    width: number,
    height: number,
    state: VisualState,
    colors: ColorScheme
  ): void {
    const isUltraCompact = height < 90;
    const meterW = isUltraCompact ? 80 : 104;
    const meterH = isUltraCompact ? 16 : 20;
    const pad = 8;
    const meterX = width - meterW - pad;
    const meterY = pad;

    this.ctx.save();

    // Background pill
    this.ctx.fillStyle = 'rgba(10, 12, 18, 0.85)';
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.roundRect(meterX, meterY, meterW, meterH, 4);
    this.ctx.fill();
    this.ctx.stroke();

    // Center divider
    const centerX = meterX + meterW / 2;
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, meterY + 2);
    this.ctx.lineTo(centerX, meterY + meterH - 2);
    this.ctx.stroke();

    // Balance puck
    const bal = state.smoothedMetrics.balance; // -1 to 1
    const puckX = centerX + bal * (meterW * 0.42);
    const puckY = meterY + meterH / 2;

    this.ctx.fillStyle = colors.stereoIndicator;
    this.ctx.shadowColor = colors.stereoIndicator;
    this.ctx.shadowBlur = 4;
    this.ctx.beginPath();
    this.ctx.arc(puckX, puckY, 3, 0, Math.PI * 2);
    this.ctx.fill();

    // Text labels
    if (!isUltraCompact) {
      this.ctx.font = '8px "JetBrains Mono", monospace';
      this.ctx.fillStyle = colors.textMuted;
      this.ctx.shadowBlur = 0;
      this.ctx.textAlign = 'left';
      this.ctx.fillText('L', meterX + 4, meterY + meterH - 5);
      this.ctx.textAlign = 'right';
      this.ctx.fillText('R', meterX + meterW - 4, meterY + meterH - 5);
    }

    this.ctx.restore();
  }

  // ==========================================
  // DEDICATED STEREO GONIOMETER
  // ==========================================
  private drawDedicatedStereometer(
    width: number,
    height: number,
    frame: AudioFrameData,
    state: VisualState,
    colors: ColorScheme
  ): void {
    const scopeSize = Math.min(height * 0.82, 180);
    const centerX = width / 2;
    const centerY = height / 2;

    this.ctx.save();

    // Radar circle
    this.ctx.strokeStyle = colors.gridLine;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, scopeSize / 2, 0, Math.PI * 2);
    this.ctx.stroke();

    // 45-degree axis lines (M/S)
    this.ctx.beginPath();
    this.ctx.moveTo(centerX - scopeSize / 2, centerY - scopeSize / 2);
    this.ctx.lineTo(centerX + scopeSize / 2, centerY + scopeSize / 2);
    this.ctx.moveTo(centerX - scopeSize / 2, centerY + scopeSize / 2);
    this.ctx.lineTo(centerX + scopeSize / 2, centerY - scopeSize / 2);
    this.ctx.stroke();

    // Lissajous audio trajectory
    const tL = frame.timeDomainL;
    const tR = frame.timeDomainR;
    const len = Math.min(tL.length, 512);

    this.ctx.beginPath();
    this.ctx.strokeStyle = colors.stereoIndicator;
    this.ctx.lineWidth = 1.4;
    this.ctx.globalAlpha = 0.85;

    for (let i = 0; i < len; i += 2) {
      const mid = (tL[i] + tR[i]) * 0.7071;
      const side = (tL[i] - tR[i]) * 0.7071;

      const px = centerX + side * (scopeSize * 0.45);
      const py = centerY - mid * (scopeSize * 0.45);

      if (i === 0) this.ctx.moveTo(px, py);
      else this.ctx.lineTo(px, py);
    }
    this.ctx.stroke();

    // Phase correlation indicator
    const corr = state.smoothedMetrics.correlation;
    this.ctx.font = '10px "JetBrains Mono", monospace';
    this.ctx.fillStyle = corr >= 0 ? '#10b981' : '#ef4444';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(
      `Fase: ${corr > 0 ? '+' : ''}${corr.toFixed(2)} | Ancho: ${(state.smoothedMetrics.width * 100).toFixed(0)}%`,
      centerX,
      height - 8
    );

    this.ctx.restore();
  }

  // ==========================================
  // FREQUENCY INSPECTOR (HOVER TOOLTIP)
  // ==========================================
  private drawFrequencyInspector(
    width: number,
    height: number,
    cursorX: number,
    state: VisualState,
    colors: ColorScheme,
    sampleRate: number
  ): void {
    const minHz = 20;
    const maxHz = Math.min(20000, sampleRate / 2);
    const minLog = Math.log10(minHz);
    const maxLog = Math.log10(maxHz);

    const logHz = minLog + (cursorX / width) * (maxLog - minLog);
    const hz = Math.round(Math.pow(10, logHz));

    const spectrum = state.smoothedSpectrum;
    const binHz = sampleRate / (spectrum.length * 2);
    const binIdx = Math.min(spectrum.length - 1, Math.max(0, Math.round(hz / binHz)));
    const magByte = spectrum[binIdx] || 0;
    const dbValue = Math.round((magByte / 255) * 60 - 60);

    let bandName = 'MID';
    let bandColor = colors.midBand;
    if (hz < 250) {
      bandName = 'LOW / BASS';
      bandColor = colors.lowBand;
    } else if (hz > 4000) {
      bandName = 'HIGH / AIR';
      bandColor = colors.highBand;
    }

    this.ctx.save();

    // Vertical cursor line
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([3, 3]);
    this.ctx.beginPath();
    this.ctx.moveTo(cursorX + 0.5, 0);
    this.ctx.lineTo(cursorX + 0.5, height);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Inspection badge
    const badgeW = 120;
    const badgeH = 22;
    const badgeX = Math.max(4, Math.min(width - badgeW - 4, cursorX - badgeW / 2));
    const badgeY = Math.max(4, height - badgeH - 4);

    this.ctx.fillStyle = 'rgba(6, 8, 14, 0.92)';
    this.ctx.strokeStyle = bandColor;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.font = '10px "JetBrains Mono", monospace';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(
      `${hz >= 1000 ? (hz / 1000).toFixed(1) + 'kHz' : hz + 'Hz'} · ${dbValue}dB`,
      badgeX + badgeW / 2,
      badgeY + 14
    );

    this.ctx.restore();
  }
}
