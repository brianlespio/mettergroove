/**
 * Open Source Horizontal Spectrum Canvas Renderer
 * 
 * High-performance, zero-dependency HTML5 Canvas 2D renderer for horizontal
 * audio spectrums and DJ deck waveforms.
 * 
 * Supports Catmull-Rom fluid spline rendering, multi-color frequency gradients,
 * peak-hold markers, and decibel grids.
 * 
 * @license MIT
 */

import { DeckAnalysisResult, SpectrumPoint } from './types';

export interface CanvasRenderOptions {
  /** Background color (CSS color string). Default: '#0a0d14' */
  backgroundColor?: string;
  /** Primary spectrum stroke color or gradient stops. Default: Cyan/Blue gradient */
  strokeColor?: string;
  /** Glow shadow color for top outline. Default: '#00d2ff' */
  glowColor?: string;
  /** Color for peak-hold caps. Default: '#38bdf8' */
  peakColor?: string;
  /** Show subtle dB & frequency grid lines. Default: true */
  showGrid?: boolean;
  /** Draw filled gradient under spectrum curve. Default: true */
  fillGradient?: boolean;
}

export class HorizontalSpectrumCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) {
      throw new Error('Canvas 2D context not available');
    }
    this.ctx = context;
  }

  /**
   * Renders a fluid horizontal spectrum curve on the canvas.
   * 
   * @param analysis The analysis result from HorizontalSpectrumAnalyzer.analyze()
   * @param options Styling and visual configuration options
   */
  public renderSpectrum(analysis: DeckAnalysisResult, options: CanvasRenderOptions = {}): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width <= 0 || height <= 0) return;

    const ctx = this.ctx;
    const points = analysis.spectrum;
    if (!points || points.length === 0) return;

    const bg = options.backgroundColor ?? '#0a0d14';
    const stroke = options.strokeColor ?? '#00d2ff';
    const glow = options.glowColor ?? '#00d2ff';
    const peakColor = options.peakColor ?? '#38bdf8';
    const showGrid = options.showGrid ?? true;
    const fillGrad = options.fillGradient ?? true;

    ctx.save();

    // 1. Clear canvas
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // 2. Draw dB grid if requested
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      const dbSteps = [0.25, 0.5, 0.75]; // -12dB, -24dB, -36dB
      for (const step of dbSteps) {
        const y = Math.round(step * height);
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
        ctx.stroke();
      }
    }

    // 3. Map spectrum points to canvas coordinates
    const coords: { x: number; y: number }[] = [];
    coords.push({ x: 0, y: height });

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const x = p.normalizedX * width;
      // Exponential visual scaling for natural optical response
      const scaledMag = Math.pow(p.magnitude, 0.88);
      const y = Math.max(2, height - scaledMag * (height - 6));
      coords.push({ x, y });
    }

    coords.push({ x: width, y: height });

    // 4. Fill gradient under curve
    if (fillGrad) {
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0.0, 'rgba(255, 30, 39, 0.45)');   // Bajos rojos caliente
      grad.addColorStop(0.22, 'rgba(249, 115, 22, 0.40)'); // Medios intermedios naranja/ámbar tibio
      grad.addColorStop(0.55, 'rgba(132, 204, 22, 0.38)'); // Medios agudos tibios claros (lima brillante)
      grad.addColorStop(0.80, 'rgba(0, 229, 255, 0.42)');  // Agudos claros fríos (cian hielo eléctrico)
      grad.addColorStop(1.0, 'rgba(56, 189, 248, 0.45)');  // Agudos claros fríos (azul cielo cristalino)

      ctx.beginPath();
      this.drawSpline(ctx, coords);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // 5. Draw glowing top stroke with Catmull-Rom spline
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    this.drawSpline(ctx, coords.slice(1, -1));
    ctx.stroke();
    ctx.restore();

    // 6. Draw Peak-Hold horizontal lines at maximum of each band
    ctx.fillStyle = peakColor;
    const bandStep = points.length > 0 ? (width / Math.max(1, points.length / 2)) : 10;
    const lineW = Math.max(5, Math.min(12, bandStep * 0.72));
    for (let i = 0; i < points.length; i += 2) {
      const p = points[i];
      if (p.peakHold > 0.05) {
        const x = p.normalizedX * width;
        const peakY = Math.max(2, height - Math.pow(p.peakHold, 0.88) * (height - 6));
        ctx.beginPath();
        ctx.roundRect(x - lineW / 2, peakY - 1, lineW, 2, 1);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /**
   * Catmull-Rom cubic spline interpolation for fluid, organic curves without sharp corners.
   */
  private drawSpline(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[]): void {
    if (points.length < 2) return;

    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i > 0 ? points[i - 1] : points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i < points.length - 2 ? points[i + 2] : p2;

      // Tension factor 0.5
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }
}
