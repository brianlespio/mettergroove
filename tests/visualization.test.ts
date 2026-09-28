import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../src/audio/AudioEngine';
import { AudioAnalysisBus } from '../src/audio/AudioAnalysisBus';
import type { AudioFrameData } from '../src/types/audio';
import { AudioAnalysisAdapter } from '../src/visualization/milkdrop/AudioAnalysisAdapter';
import { assertMilkSource, convertMilkPreset, repairMilkSource } from '../src/visualization/milkdrop/convertMilkPreset';
import { nextPresetId, previousPresetId, randomPresetId } from '../src/visualization/presetIndex';
import {
  createGenerativePreset,
  deserializeGenerativePreset,
  serializeGenerativePreset,
} from '../src/visualization/generative/GenerativePreset';
import { MemoryPresetStore } from '../src/presets/LocalPresetStore';
import { PresetManager } from '../src/presets/PresetManager';
import { canvasBackingSize } from '../src/rendering/canvasSize';
import { loadPreferences, savePreferences } from '../src/settings/persistence';
import { readFileSync } from 'node:fs';

function frame(sampleRate = 48000): AudioFrameData {
  const frequencyL = new Uint8Array(1024);
  const frequencyR = new Uint8Array(1024);
  return {
    timeDomainL: new Float32Array(2048),
    timeDomainR: new Float32Array(2048),
    frequencyL,
    frequencyR,
    sampleRate,
    fftSize: 2048,
    metrics: {
      balance: 0,
      correlation: 1,
      midPower: 0,
      sidePower: 0,
      width: 0,
      rmsL: 0.2,
      rmsR: 0.2,
      peakL: 0.4,
      peakR: 0.4,
    },
    bands: { low: 0, mid: 0, high: 0 },
  };
}

describe('audio', () => {
  it('initializes without capturing audio', () => {
    const engine = new AudioEngine();
    expect(engine.getSourceType()).toBe('none');
    expect(engine.getContextState()).toBe('uninitialized');
    expect(engine.getAudioTap()).toBeNull();
  });

  it('returns waveform and fft buffers before a source is selected', () => {
    const data = new AudioEngine().getFrameData();
    expect(data.timeDomainL.length).toBe(2048);
    expect(data.frequencyL.length).toBe(1024);
    expect(data.bands.low).toBe(0);
  });

  it('normalizes frequency bands to 0..1', () => {
    const bus = new AudioAnalysisBus();
    const sample = frame();
    sample.frequencyL[4] = 255;
    sample.frequencyR[4] = 255;
    sample.frequencyL[40] = 200;
    sample.frequencyR[40] = 200;
    const analysis = bus.update(sample, 1 / 60, false);
    expect(analysis.waveform.length).toBe(2048);
    expect(analysis.fft.length).toBe(1024);
    expect(analysis.bass).toBeGreaterThan(0);
    expect(analysis.bass).toBeLessThanOrEqual(1);
    expect(analysis.mid).toBeGreaterThanOrEqual(0);
    expect(analysis.mid).toBeLessThanOrEqual(1);
    expect(analysis.treble).toBeLessThanOrEqual(1);
    expect(analysis.amplitude).toBeGreaterThan(0);
    expect(analysis.amplitude).toBeLessThanOrEqual(1);
  });
});

describe('milkdrop presets', () => {
  const ids = ['original:a.milk', 'original:b.milk', 'folder/', 'original:c.milk'];

  it('walks only playable presets', () => {
    const blocked = new Set<string>();
    expect(nextPresetId({ ids, currentId: 'original:a.milk', blocked })).toBe('original:b.milk');
    expect(previousPresetId({ ids, currentId: 'original:a.milk', blocked })).toBe('original:c.milk');
    expect(nextPresetId({ ids, currentId: 'original:b.milk', blocked: new Set(['original:c.milk']) })).toBe('original:a.milk');
  });

  it('random ignores blocked, folders and the current preset when another exists', () => {
    const id = randomPresetId(
      { ids, currentId: 'original:a.milk', blocked: new Set(['original:b.milk']) },
      () => 0
    );
    expect(id).toBe('original:c.milk');
  });

  it('rejects a file that is not a milk preset', async () => {
    expect(() => assertMilkSource('not a preset')).toThrow(/incompatible/i);
    await expect(convertMilkPreset('# comment only')).rejects.toThrow(/incompatible/i);
  });

  it('keeps chained MilkDrop color math as arithmetic', async () => {
    const source = readFileSync('presetscream/Dancer/Blobby Mirror/martin - another kind of groove.milk', 'utf8');
    const repaired = repairMilkSource(source);
    expect(repaired).toContain('(crisp*.99)');
    expect(repaired).toContain('((tex2D(sampler_blur1, frac(uv)).xyz * scale1) + bias1)');
    const converted = await convertMilkPreset(source);
    expect(converted.warp).not.toMatch(/&& bvec/);
    expect(converted.comp).not.toMatch(/&& bvec/);
    expect(converted.comp).toContain('main_shader_sentinel(uv, rad, ang)');
    expect(readFileSync('presetscream/Dancer/Blobby Mirror/martin - another kind of groove.milk', 'utf8')).toBe(source);
    const leaves = repairMilkSource(readFileSync('presetscream/Particles/Swarm/martin - autumn leaves.milk', 'utf8'));
    expect(leaves).toContain('return ((y < 0 ? -r : r)/4)');
    expect(leaves).not.toContain('(return');
    const waltra = await convertMilkPreset(readFileSync('presetscream/Waveform/Wire Circular/Waltra - Codex Machine.milk', 'utf8'));
    expect(waltra.warp).toContain('uniform sampler2D sampler_grad3;');
    expect(waltra.warp).not.toMatch(/(?<!uniform )sampler2D sampler_grad3;/);
  });

  it('converts an original .milk preset without rewriting the source', async () => {
    const path = 'motor/projectm-4.1.7/presets/tests/001-line.milk';
    const source = readFileSync(path, 'utf8');
    const converted = await convertMilkPreset(source);
    expect(source.includes('[preset00]')).toBe(true);
    expect(converted.baseVals.wave_mode).toBe(6);
    expect(Array.isArray(converted.shapes)).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe(source);
  });
});

describe('generative presets', () => {
  it('reproduces a preset from the same seed', () => {
    const first = createGenerativePreset(184739, '2026-01-01T00:00:00.000Z');
    const second = createGenerativePreset(184739, '2026-01-01T00:00:00.000Z');
    expect(second).toEqual(first);
    expect(createGenerativePreset(184740, '2026-01-01T00:00:00.000Z').algorithm).toBeTypeOf('string');
  });

  it('serializes and restores the full preset', () => {
    const preset = createGenerativePreset(184739, '2026-01-01T00:00:00.000Z');
    const restored = deserializeGenerativePreset(serializeGenerativePreset(preset));
    expect(restored).toEqual(preset);
    expect(restored.parameters).toEqual(preset.parameters);
    expect(restored.audioMappings).toEqual(preset.audioMappings);
    expect(restored.colorParameters).toEqual(preset.colorParameters);
  });

  it('saves and reloads a user preset without touching milkdrop ids', () => {
    const store = new MemoryPresetStore();
    const manager = new PresetManager(store, [], async () => ({ version: 1, collections: { original: [], community: [] } }));
    const preset = createGenerativePreset(42, '2026-01-01T00:00:00.000Z');
    const saved = manager.saveGenerated(preset);
    const reloaded = new PresetManager(store);
    expect(reloaded.get(saved.id)).toMatchObject({ id: saved.id, name: preset.name, type: 'generated' });
    expect(reloaded.userPresets()[0].preset.seed).toBe(42);
    expect(reloaded.collectionIds('original')).toEqual([]);
  });
});

describe('visualization state', () => {
  it('keeps the canvas aspect ratio when the window and pixel ratio change', () => {
    const size = canvasBackingSize(1920, 1080, 2);
    expect(size.width / size.height).toBeCloseTo(1920 / 1080, 2);
    const portrait = canvasBackingSize(390, 844, 3);
    expect(portrait.ratio).toBe(2);
    expect(portrait.width / portrait.height).toBeCloseTo(390 / 844, 2);
  });

  it('persists the selected mode and restores it', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
      clear: () => memory.clear(),
      key: () => null,
      length: 0,
    } as Storage;
    savePreferences({
      version: 1,
      family: 'generative',
      config: {
        mode: 'spectrum',
        colorScheme: 'infrared',
        height: 115,
        decayRate: 160,
        smoothing: 0.65,
        waveformStyle: 'scrolling',
        showStereometer: false,
        showFrequencyGrid: true,
        selectedBandHz: null,
      },
      milkdropPresetId: 'original:a.milk',
      generatedPresetId: 'user:42',
      audioSource: 'mic',
      fullscreen: true,
      favoriteIds: ['original:a.milk'],
    }, storage);
    expect(loadPreferences(storage)?.family).toBe('generative');
    expect(loadPreferences(storage)?.config.mode).toBe('spectrum');
    expect(loadPreferences(storage)?.favoriteIds).toEqual(['original:a.milk']);
  });
});

describe('milkdrop audio mapping', () => {
  it('produces finite bass, mid, treb and pcm for the adapter', () => {
    const adapter = new AudioAnalysisAdapter();
    const bus = new AudioAnalysisBus();
    const sample = frame();
    sample.frequencyL[4] = 255;
    sample.frequencyR[4] = 255;
    sample.timeDomainL[0] = 0.5;
    const mapped = adapter.convert(bus.update(sample, 1 / 60, false));
    expect(mapped.bass).toBeGreaterThan(0);
    expect(mapped.pcm.length).toBe(576);
    expect(Number.isFinite(mapped.bassAtt)).toBe(true);
    expect(Number.isFinite(mapped.midAtt)).toBe(true);
    expect(Number.isFinite(mapped.trebAtt)).toBe(true);
  });
});
