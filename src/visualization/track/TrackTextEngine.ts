import type { AudioAnalysisData } from '../../audio/AudioAnalysisData';
import { canvasBackingSize } from '../../rendering/canvasSize';
import type { TrackBlendMode, TrackTextStyle } from '../../traktor/types';

const TEXT_WIDTH = 2048;
const TEXT_HEIGHT = 1024;

const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
uniform vec2 uScale;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos * uScale, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision mediump float;
uniform sampler2D uText;
uniform float uTime;
uniform float uBass;
uniform float uTreble;
uniform float uBeat;
uniform float uFade;
uniform int uStyle;
uniform float uWave0;
uniform float uWave1;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 uv = vUv;
  if (uStyle == 1) {
  float sampleWave = mix(uWave0, uWave1, uv.x);
    uv.y += sin(uv.x * 16.0 + uTime * 1.6) * (0.012 + uBass * 0.045);
    uv.y += (sampleWave - 0.5) * uTreble * 0.05;
  } else if (uStyle == 2) {
    float band = step(0.5, fract(uv.y * 9.0));
    uv.x += band * uBeat * 0.045;
  }
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    fragColor = vec4(0.0);
    return;
  }
  vec4 color = texture(uText, uv);
  color.rgb += vec3(uBeat * 0.35, uBeat * 0.2, uBass * 0.15);
  color.a *= uFade;
  fragColor = color;
}`;

/**
 * Cached text texture drawn over the visual. The texture is rebuilt only when
 * the words change. Each frame updates uniforms.
 */
export class TrackTextEngine {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private buffer: WebGLBuffer | null = null;
  private textCanvas: HTMLCanvasElement | null = null;
  private textContext: CanvasRenderingContext2D | null = null;
  private cacheKey = '';
  private fade = 1;
  private readonly wave = new Float32Array(8);
  private blend: TrackBlendMode = 'screen';
  private released = false;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  init(): void {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) return;
    this.gl = gl;
    const program = gl.createProgram();
    if (!program) return;
    const vertex = this.compile(gl.VERTEX_SHADER, VERT);
    const fragment = this.compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vertex || !fragment) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, 'aPos');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[Traktor] el shader de texto no enlazó', gl.getProgramInfoLog(program));
      return;
    }
    this.program = program;
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.textCanvas = document.createElement('canvas');
    this.textCanvas.width = TEXT_WIDTH;
    this.textCanvas.height = TEXT_HEIGHT;
    this.textContext = this.textCanvas.getContext('2d');
  }

  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    const size = canvasBackingSize(cssWidth, cssHeight, devicePixelRatio);
    if (this.canvas.width !== size.width) this.canvas.width = size.width;
    if (this.canvas.height !== size.height) this.canvas.height = size.height;
    this.gl?.viewport(0, 0, size.width, size.height);
  }

  setBlend(blend: TrackBlendMode): void {
    if (this.blend === blend) return;
    this.blend = blend;
    this.canvas.style.mixBlendMode = blend === 'normal' ? 'normal' : blend;
  }

  render(
    analysis: AudioAnalysisData,
    content: { djs: readonly string[]; track: readonly string[] },
    style: TrackTextStyle,
  ): void {
    const gl = this.gl;
    const program = this.program;
    if (!gl || !program || this.released) return;
    const djs = content.djs.map((line) => line.trim()).filter(Boolean).slice(0, 2);
    const track = content.track.map((line) => line.trim()).filter(Boolean).slice(0, 2);
    const key = `${djs.join('\n')}||${track.join('\n')}`;
    if (key !== this.cacheKey) {
      this.cacheKey = key;
      this.fade = 0;
      this.paint(djs, track);
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (key === '||') return;
    this.fade = Math.min(1, this.fade + Math.max(0.016, analysis.deltaTime) / 0.45);
    const waveform = analysis.waveform;
    const step = Math.max(1, Math.floor(waveform.length / this.wave.length));
    for (let index = 0; index < this.wave.length; index += 1) {
      this.wave[index] = waveform[index * step] ?? 0;
    }
    const beat = analysis.beat ? analysis.beatStrength : analysis.beatStrength * 0.35;
    const scale = (style === 'pulse' ? 0.62 : 0.7) + analysis.bass * 0.22 + beat * 0.1;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(gl.getUniformLocation(program, 'uText'), 0);
    gl.uniform2f(gl.getUniformLocation(program, 'uScale'), Math.min(0.92, scale), Math.min(0.42, scale * 0.34));
    gl.uniform1f(gl.getUniformLocation(program, 'uTime'), analysis.time);
    gl.uniform1f(gl.getUniformLocation(program, 'uBass'), analysis.bass);
    gl.uniform1f(gl.getUniformLocation(program, 'uTreble'), analysis.treble);
    gl.uniform1f(gl.getUniformLocation(program, 'uBeat'), beat);
    gl.uniform1f(gl.getUniformLocation(program, 'uFade'), this.fade);
    gl.uniform1i(gl.getUniformLocation(program, 'uStyle'), style === 'wave' ? 1 : style === 'glitch' ? 2 : 0);
    gl.uniform1f(gl.getUniformLocation(program, 'uWave0'), this.wave[0]);
    gl.uniform1f(gl.getUniformLocation(program, 'uWave1'), this.wave[7]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose(): void {
    if (this.released) return;
    this.released = true;
    const gl = this.gl;
    if (gl) {
      if (this.texture) gl.deleteTexture(this.texture);
      if (this.buffer) gl.deleteBuffer(this.buffer);
      if (this.program) gl.deleteProgram(this.program);
    }
    this.texture = null;
    this.buffer = null;
    this.program = null;
    this.gl = null;
  }

  private paint(djs: readonly string[], track: readonly string[]): void {
    const context = this.textContext;
    const gl = this.gl;
    if (!context || !gl || !this.texture || !this.textCanvas) return;
    context.clearRect(0, 0, TEXT_WIDTH, TEXT_HEIGHT);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = 'rgba(103, 232, 249, 0.85)';
    context.shadowBlur = 28;
    context.fillStyle = '#f8fafc';
    if (djs.length === 1) {
      context.font = '700 188px Impact, "Arial Narrow", sans-serif';
      context.fillText(djs[0], TEXT_WIDTH / 2, track.length ? 390 : 512, TEXT_WIDTH - 80);
    } else if (djs.length === 2) {
      context.font = '700 150px Impact, "Arial Narrow", sans-serif';
      context.fillText(djs[0], TEXT_WIDTH / 2, 300, TEXT_WIDTH - 80);
      context.fillText(djs[1], TEXT_WIDTH / 2, 500, TEXT_WIDTH - 80);
    }
    if (track.length > 0) {
      const top = djs.length > 0 ? 720 : (track.length > 1 ? 430 : 512);
      context.font = djs.length > 0 ? '500 72px "Segoe UI", sans-serif' : '700 168px Impact, "Arial Narrow", sans-serif';
      context.fillStyle = djs.length > 0 ? '#67e8f9' : '#f8fafc';
      context.fillText(track[0], TEXT_WIDTH / 2, top, TEXT_WIDTH - 100);
      if (track[1]) {
        context.font = '500 64px "Segoe UI", sans-serif';
        context.fillStyle = '#67e8f9';
        context.fillText(track[1], TEXT_WIDTH / 2, top + 120, TEXT_WIDTH - 120);
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.textCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  }

  private compile(type: number, source: string): WebGLShader | null {
    const gl = this.gl;
    if (!gl) return null;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[Traktor] shader', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
}
