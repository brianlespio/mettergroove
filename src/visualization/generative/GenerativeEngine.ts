import type { AudioAnalysisData } from '../../audio/AudioAnalysisData';
import { canvasBackingSize } from '../../rendering/canvasSize';
import type { VisualizationEngine } from '../VisualizationEngine';
import {
  createGenerativePreset,
  type AudioMappingSource,
  type AudioMappingTarget,
  type GenerativeAlgorithm,
  type GenerativePreset,
} from './GenerativePreset';
import {
  BLIT_FRAG,
  FRACTAL_FRAG,
  FULLSCREEN_VERT,
  INTERFERENCE_FRAG,
  KALEIDOSCOPE_FRAG,
  SPIRAL_FRAG,
  VECTOR_FIELD_FRAG,
  WAVEFORM_FRAG,
} from './shaders';

const SOURCES: readonly AudioMappingSource[] = ['bass', 'mid', 'treble', 'amplitude', 'beat', 'waveform'];

const FRAGMENTS: Record<GenerativeAlgorithm, string> = {
  vector_field: VECTOR_FIELD_FRAG,
  interference: INTERFERENCE_FRAG,
  spiral: SPIRAL_FRAG,
  fractal: FRACTAL_FRAG,
  waveform: WAVEFORM_FRAG,
  kaleidoscope: KALEIDOSCOPE_FRAG,
};

interface Surface {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
}

interface Modulated {
  scale: number;
  noise: number;
  speed: number;
  brightness: number;
  displacement: number;
}

/**
 * GPU generative renderer. Programs, buffers and history targets are created
 * once and reused. Audio only updates uniforms.
 */
export class GenerativeEngine implements VisualizationEngine {
  readonly kind = 'generative' as const;

  private gl: WebGL2RenderingContext | null = null;
  private programs = new Map<GenerativeAlgorithm, WebGLProgram>();
  private blit: WebGLProgram | null = null;
  private quad: WebGLBuffer | null = null;
  private waveTexture: WebGLTexture | null = null;
  private readonly waveUpload = new Uint8Array(512);
  private surfaces: Surface[] = [];
  private writeIndex = 0;
  private backingWidth = 1;
  private backingHeight = 1;
  private preset: GenerativePreset = createGenerativePreset(1, '1970-01-01T00:00:00.000Z');
  private elapsed = 0;
  private rotation = 0;
  private impulse = 0;
  private failed = new Set<GenerativeAlgorithm>();
  private released = false;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  init(): void {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL2 no está disponible');
    this.gl = gl;
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.blit = this.compile(FULLSCREEN_VERT, BLIT_FRAG);
    (Object.keys(FRAGMENTS) as GenerativeAlgorithm[]).forEach((algorithm) => {
      try {
        this.programs.set(algorithm, this.compile(FULLSCREEN_VERT, FRAGMENTS[algorithm]));
      } catch (error) {
        this.failed.add(algorithm);
        console.error('[Generative] shader no compiló', algorithm, error instanceof Error ? error.message : error);
      }
    });
    this.waveTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.waveTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.waveUpload.length, 1, 0, gl.RED, gl.UNSIGNED_BYTE, this.waveUpload);
    this.rotation = this.preset.motionParameters.rotation;
  }

  availableAlgorithms(): GenerativeAlgorithm[] {
    return (Object.keys(FRAGMENTS) as GenerativeAlgorithm[]).filter((algorithm) => !this.failed.has(algorithm));
  }

  getPreset(): GenerativePreset {
    return this.preset;
  }

  setPreset(preset: GenerativePreset): void {
    const available = this.availableAlgorithms();
    const algorithm = available.includes(preset.algorithm) ? preset.algorithm : available[0];
    this.preset = algorithm ? { ...preset, algorithm } : preset;
    this.elapsed = 0;
    this.rotation = preset.motionParameters.rotation;
    this.impulse = 0;
    this.clearHistory();
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    const gl = this.gl;
    if (!gl) return;
    const size = canvasBackingSize(width, height, devicePixelRatio);
    if (size.width === this.backingWidth && size.height === this.backingHeight && this.surfaces.length === 2) {
      return;
    }
    this.backingWidth = size.width;
    this.backingHeight = size.height;
    this.canvas.width = size.width;
    this.canvas.height = size.height;
    this.canvas.style.width = `${Math.max(1, Math.floor(width))}px`;
    this.canvas.style.height = `${Math.max(1, Math.floor(height))}px`;
    this.rebuildSurfaces();
  }

  render(analysis: AudioAnalysisData): void {
    const gl = this.gl;
    const program = this.programs.get(this.preset.algorithm);
    if (!gl || !program || this.surfaces.length < 2) return;

    this.elapsed += analysis.deltaTime;
    const modulated = this.modulate(analysis);
    this.uploadWaveform(analysis.waveform);

    const write = this.surfaces[this.writeIndex];
    const read = this.surfaces[1 - this.writeIndex];
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.framebuffer);
    gl.viewport(0, 0, this.backingWidth, this.backingHeight);
    gl.useProgram(program);
    this.bindSources(program, read.texture);
    this.setUniforms(program, modulated, analysis);
    this.draw();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.backingWidth, this.backingHeight);
    if (!this.blit) return;
    gl.useProgram(this.blit);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, write.texture);
    const sampler = gl.getUniformLocation(this.blit, 'u_prev');
    gl.uniform1i(sampler, 1);
    this.draw();
    this.writeIndex = 1 - this.writeIndex;
  }

  dispose(): void {
    if (this.released) return;
    this.released = true;
    const gl = this.gl;
    if (!gl) return;
    for (const program of this.programs.values()) gl.deleteProgram(program);
    if (this.blit) gl.deleteProgram(this.blit);
    if (this.quad) gl.deleteBuffer(this.quad);
    if (this.waveTexture) gl.deleteTexture(this.waveTexture);
    this.deleteSurfaces();
    this.programs.clear();
    this.gl = null;
  }

  private modulate(analysis: AudioAnalysisData): Modulated {
    const parameters = this.preset.parameters;
    const modulated: Modulated = {
      scale: parameters.scale,
      noise: parameters.noiseScale,
      speed: parameters.speed,
      brightness: 0.85 + analysis.amplitude * 0.15,
      displacement: 0.35,
    };
    for (let i = 0; i < SOURCES.length; i++) {
      const source = SOURCES[i];
      const target = this.preset.audioMappings[source];
      if (!target) continue;
      const amount = sourceValue(source, analysis);
      applyTarget(target, amount, modulated, analysis, this);
    }
    this.impulse *= Math.max(0, 1 - analysis.deltaTime * 2.4);
    this.rotation += this.preset.motionParameters.drift * analysis.deltaTime + this.impulse * 1.4;
    return modulated;
  }

  addImpulse(amount: number): void {
    this.impulse = Math.max(this.impulse, amount);
  }

  addRotation(amount: number): void {
    this.rotation += amount;
  }

  private uploadWaveform(waveform: Float32Array): void {
    const gl = this.gl;
    if (!gl || !this.waveTexture) return;
    const upload = this.waveUpload;
    const step = waveform.length / upload.length;
    for (let i = 0; i < upload.length; i++) {
      const sample = waveform[Math.min(waveform.length - 1, Math.floor(i * step))] || 0;
      upload[i] = Math.max(0, Math.min(255, Math.round((sample * 0.5 + 0.5) * 255)));
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.waveTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, upload.length, 1, gl.RED, gl.UNSIGNED_BYTE, upload);
  }

  private bindSources(program: WebGLProgram, previous: WebGLTexture): void {
    const gl = this.gl;
    if (!gl) return;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.waveTexture);
    gl.uniform1i(this.location(program, 'u_wave'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, previous);
    gl.uniform1i(this.location(program, 'u_prev'), 1);
  }

  private readonly uniformCache = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();

  private location(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    const gl = this.gl;
    if (!gl) return null;
    let table = this.uniformCache.get(program);
    if (!table) {
      table = new Map();
      this.uniformCache.set(program, table);
    }
    if (!table.has(name)) table.set(name, gl.getUniformLocation(program, name));
    return table.get(name) ?? null;
  }

  private setUniforms(program: WebGLProgram, modulated: Modulated, analysis: AudioAnalysisData): void {
    const gl = this.gl;
    if (!gl) return;
    const colors = this.preset.colorParameters;
    gl.uniform2f(this.location(program, 'u_resolution'), this.backingWidth, this.backingHeight);
    gl.uniform1f(this.location(program, 'u_time'), this.elapsed);
    gl.uniform1f(this.location(program, 'u_bass'), analysis.bass);
    gl.uniform1f(this.location(program, 'u_mid'), analysis.mid);
    gl.uniform1f(this.location(program, 'u_treble'), analysis.treble);
    gl.uniform1f(this.location(program, 'u_amplitude'), analysis.amplitude);
    gl.uniform1f(this.location(program, 'u_beat'), analysis.beat ? analysis.beatStrength : 0);
    gl.uniform1f(this.location(program, 'u_seed'), this.preset.seed % 1000);
    gl.uniform1f(this.location(program, 'u_symmetry'), this.preset.parameters.symmetry);
    gl.uniform1f(this.location(program, 'u_feedback'), this.preset.parameters.feedback);
    gl.uniform1f(this.location(program, 'u_rotation'), this.rotation);
    gl.uniform1f(this.location(program, 'u_twist'), this.preset.geometryParameters.twist);
    gl.uniform1f(this.location(program, 'u_formula'), this.preset.parameters.formula ?? (Math.abs(this.preset.seed) % 6));
    gl.uniform1f(this.location(program, 'u_scale'), modulated.scale);
    gl.uniform1f(this.location(program, 'u_noise'), modulated.noise);
    gl.uniform1f(this.location(program, 'u_speed'), modulated.speed);
    gl.uniform1f(this.location(program, 'u_brightness'), modulated.brightness);
    gl.uniform1f(this.location(program, 'u_displacement'), modulated.displacement);
    gl.uniform3f(this.location(program, 'u_colorA'), colors.a[0], colors.a[1], colors.a[2]);
    gl.uniform3f(this.location(program, 'u_colorB'), colors.b[0], colors.b[1], colors.b[2]);
    gl.uniform3f(this.location(program, 'u_colorC'), colors.c[0], colors.c[1], colors.c[2]);
  }

  private draw(): void {
    const gl = this.gl;
    if (!gl || !this.quad) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private compile(vertexSource: string, fragmentSource: string): WebGLProgram {
    const gl = this.gl;
    if (!gl) throw new Error('WebGL2 no está disponible');
    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) throw new Error('No se pudo crear el programa WebGL');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, 'a_pos');
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program) || 'link error';
      gl.deleteProgram(program);
      throw new Error(info);
    }
    return program;
  }

  private clearHistory(): void {
    const gl = this.gl;
    if (!gl || this.surfaces.length === 0) return;
    gl.clearColor(0, 0, 0, 1);
    for (const surface of this.surfaces) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, surface.framebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private rebuildSurfaces(): void {
    const gl = this.gl;
    if (!gl) return;
    this.deleteSurfaces();
    this.surfaces = [this.createSurface(), this.createSurface()];
    this.writeIndex = 0;
  }

  private createSurface(): Surface {
    const gl = this.gl;
    if (!gl) throw new Error('WebGL2 no está disponible');
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error('No se pudo crear el framebuffer');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.backingWidth, this.backingHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Framebuffer generativo incompleto');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { texture, framebuffer };
  }

  private deleteSurfaces(): void {
    const gl = this.gl;
    if (!gl) return;
    for (const surface of this.surfaces) {
      gl.deleteFramebuffer(surface.framebuffer);
      gl.deleteTexture(surface.texture);
    }
    this.surfaces = [];
  }
}

function sourceValue(source: AudioMappingSource, analysis: AudioAnalysisData): number {
  if (source === 'bass') return analysis.bass;
  if (source === 'mid') return analysis.mid;
  if (source === 'treble') return analysis.treble;
  if (source === 'amplitude') return analysis.amplitude;
  if (source === 'beat') return analysis.beat ? Math.max(analysis.beatStrength, 0.65) : 0;
  return Math.min(1, Math.abs(analysis.waveform[0] || 0));
}

function applyTarget(
  target: AudioMappingTarget,
  amount: number,
  modulated: Modulated,
  analysis: AudioAnalysisData,
  engine: GenerativeEngine
): void {
  if (target === 'scale') modulated.scale *= 0.72 + amount;
  else if (target === 'noise') modulated.noise *= 0.65 + amount * 1.5;
  else if (target === 'speed') modulated.speed *= 0.45 + amount * 1.2;
  else if (target === 'brightness') modulated.brightness *= 0.4 + amount * 1.35;
  else if (target === 'displacement') modulated.displacement = 0.15 + amount;
  else if (target === 'impulse' && analysis.beat) engine.addImpulse(amount);
  else if (target === 'rotation') engine.addRotation(amount * analysis.deltaTime * 1.8);
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('No se pudo crear el shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || 'compile error';
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}
