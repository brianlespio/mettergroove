import type { AudioAnalysisData } from '../../audio/AudioAnalysisData';
import type { ButterchurnPreset, ButterchurnVisualizer } from 'butterchurn';
import { milkdropPresetUrl, textureCandidateUrls } from '../../presets/PresetManager';
import type { PresetRecord } from '../../presets/types';
import type { VisualizationEngine } from '../VisualizationEngine';
import { AudioAnalysisAdapter } from './AudioAnalysisAdapter';
import { convertMilkPreset, customSamplerNames, MilkPresetError } from './convertMilkPreset';

export interface MilkdropLibrary {
  read(record: PresetRecord): Promise<string>;
  markIncompatible(id: string): void;
}

const CACHE_LIMIT = 8;

/**
 * Isolated MilkDrop backend.
 * JavaScript talks only to this class. Butterchurn (WebGL2) executes the
 * converted preset. Original .milk files are never rewritten.
 */
export class MilkDropEngine implements VisualizationEngine {
  readonly kind = 'audio-rhythmic' as const;

  private visualizer: ButterchurnVisualizer | null = null;
  private audioNode: AudioNode | null = null;
  private readonly adapter = new AudioAnalysisAdapter();
  private readonly cache = new Map<string, ButterchurnPreset>();
  private current: PresetRecord | null = null;
  private loadToken = 0;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private disposed = false;
  private released = false;
  private resolveReady: (() => void) | null = null;
  private readonly ready: Promise<void>;
  private onFrameFailure: ((id: string) => void) | null = null;
  private lastPresetLoadMs = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly audioContext: AudioContext,
    private readonly library: MilkdropLibrary
  ) {
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  setFrameFailureHandler(handler: (id: string) => void): void {
    this.onFrameFailure = handler;
  }

  getCurrentPreset(): PresetRecord | null {
    return this.current;
  }

  presetLoadMs(): number {
    return this.lastPresetLoadMs;
  }

  async init(audioNode: AudioNode | null): Promise<void> {
    try {
      if (this.disposed) return;
      const mod = await import('butterchurn');
      const api = resolveButterchurn(mod);
      if (!api) {
        throw new Error('WebGL MilkDrop no está disponible en este navegador');
      }
      this.visualizer = api.createVisualizer(this.audioContext, this.canvas, {
        width: this.width,
        height: this.height,
        pixelRatio: this.pixelRatio,
        textureRatio: 1,
      });
      if (audioNode) this.connectAudio(audioNode);
    } finally {
      this.resolveReady?.();
      this.resolveReady = null;
    }
  }

  connectAudio(node: AudioNode): void {
    if (!this.visualizer || this.audioNode === node) return;
    if (this.audioNode) {
      try {
        this.visualizer.disconnectAudio(this.audioNode);
      } catch {
        // The previous node may already be gone.
      }
    }
    this.visualizer.connectAudio(node);
    this.audioNode = node;
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.pixelRatio = Math.min(2, Math.max(1, devicePixelRatio || 1));
    // Butterchurn's screen viewport is the CSS size. pixelRatio only scales internal textures.
    if (this.canvas.width !== this.width) this.canvas.width = this.width;
    if (this.canvas.height !== this.height) this.canvas.height = this.height;
    this.visualizer?.setRendererSize(this.width, this.height, { pixelRatio: this.pixelRatio });
    this.canvas.getContext('webgl2')?.getError();
  }

  setAudioData(analysis: AudioAnalysisData): void {
    this.adapter.convert(analysis);
  }

  render(analysis: AudioAnalysisData): void {
    this.setAudioData(analysis);
    if (!this.visualizer || !this.current) return;
    try {
      this.visualizer.render();
    } catch (error) {
      const id = this.current.id;
      console.error('[MilkDrop] preset incompatible durante el frame', id, error);
      this.library.markIncompatible(id);
      this.current = null;
      this.onFrameFailure?.(id);
    }
  }

  async loadPreset(record: PresetRecord): Promise<void> {
    if (!record.path) throw new MilkPresetError('Preset incompatible');
    const started = performance.now();
    const text = await this.library.read(record);
    await this.loadPresetData(text, record);
    this.lastPresetLoadMs = performance.now() - started;
  }

  async loadPresetData(data: string, record?: PresetRecord): Promise<void> {
    await this.ready;
    if (!this.visualizer || this.disposed) throw new Error('MilkDrop todavía no está inicializado');
    const token = ++this.loadToken;
    const cacheKey = record?.id ?? '';
    let preset = cacheKey ? this.cache.get(cacheKey) : undefined;
    if (!preset) {
      preset = await convertMilkPreset(data);
      if (token !== this.loadToken) return;
      if (cacheKey) this.remember(cacheKey, preset);
    }
    if (token !== this.loadToken || this.disposed || !this.visualizer) return;
    try {
      await this.attachTextures(preset, token);
      if (token !== this.loadToken || !this.visualizer) return;
      this.visualizer.loadPreset(preset, 0);
      this.current = record ?? this.current;
    } catch (error) {
      if (record) {
        console.error('[MilkDrop] preset incompatible', record.id, error);
        this.library.markIncompatible(record.id);
      }
      throw error instanceof MilkPresetError ? error : new MilkPresetError('Preset incompatible');
    }
  }

  dispose(): void {
    if (this.released) return;
    this.released = true;
    this.disposed = true;
    this.resolveReady?.();
    this.resolveReady = null;
    this.loadToken += 1;
    if (this.visualizer && this.audioNode) {
      try {
        this.visualizer.disconnectAudio(this.audioNode);
      } catch {
        // Context may already be closed.
      }
    }
    this.visualizer = null;
    this.audioNode = null;
    this.current = null;
    this.cache.clear();
    this.adapter.reset();
  }

  private remember(id: string, preset: ButterchurnPreset): void {
    if (this.cache.has(id)) this.cache.delete(id);
    this.cache.set(id, preset);
    if (this.cache.size <= CACHE_LIMIT) return;
    const oldest = this.cache.keys().next().value;
    if (oldest) this.cache.delete(oldest);
  }

  private async attachTextures(preset: ButterchurnPreset, token: number): Promise<void> {
    const names = customSamplerNames(`${preset.warp ?? ''}\n${preset.comp ?? ''}`);
    if (names.length === 0 || !this.visualizer) return;
    const images: Record<string, { data: string; width: number; height: number }> = {};
    await Promise.all(names.map(async (sampler) => {
      const image = await loadFirstTexture(sampler);
      if (image) images[sampler.replace(/^sampler_/, '')] = image;
    }));
    if (token !== this.loadToken || !this.visualizer) return;
    if (Object.keys(images).length > 0) this.visualizer.loadExtraImages(images);
  }
}

export async function readMilkdropFile(record: PresetRecord): Promise<string> {
  if (!record.path) throw new MilkPresetError('Preset incompatible');
  const response = await fetch(milkdropPresetUrl(record.path));
  if (!response.ok) throw new MilkPresetError('Preset incompatible');
  return response.text();
}

async function loadFirstTexture(sampler: string): Promise<{ data: string; width: number; height: number } | null> {
  for (const url of textureCandidateUrls(sampler)) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) continue;
      const bitmap = await createImageBitmap(blob);
      const data = await blobToDataUrl(blob);
      const image = { data, width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return image;
    } catch {
      // Try the next filename. Missing textures must not abort the preset.
    }
  }
  return null;
}

function resolveButterchurn(mod: {
  default?: { createVisualizer?: unknown; default?: { createVisualizer?: unknown } };
}): { createVisualizer: typeof import('butterchurn').default.createVisualizer } | null {
  const candidate = mod.default;
  if (candidate && typeof candidate.createVisualizer === 'function') {
    return candidate as { createVisualizer: typeof import('butterchurn').default.createVisualizer };
  }
  const nested = candidate?.default;
  if (nested && typeof nested.createVisualizer === 'function') {
    return nested as { createVisualizer: typeof import('butterchurn').default.createVisualizer };
  }
  return null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
