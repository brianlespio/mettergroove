import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dices,
  Maximize2,
  Minimize2,
  Settings,
  SkipBack,
  SkipForward,
  Sparkles,
  Star,
} from 'lucide-react';
import type { AudioEngine } from '../audio/AudioEngine';
import { AudioAnalysisBus } from '../audio/AudioAnalysisBus';
import { PerformanceMonitor } from '../rendering/PerformanceMonitor';
import { PresetManager } from '../presets/PresetManager';
import type { PresetCollectionId } from '../presets/types';
import type { GenerativePreset } from '../visualization/generative/GenerativePreset';
import { GenerativeEngine } from '../visualization/generative/GenerativeEngine';
import { MilkDropEngine, readMilkdropFile } from '../visualization/milkdrop/MilkDropEngine';
import { TrackTextEngine } from '../visualization/track/TrackTextEngine';
import type { TrackBlendMode, TrackTextStyle } from '../traktor/types';
import type { VisualizationFamily } from '../visualization/types';

interface VisualizationStageProps {
  family: Exclude<VisualizationFamily, 'analyzer'>;
  audio: AudioEngine;
  manager: PresetManager;
  milkdropId: string | null;
  onMilkdropId: (id: string) => void;
  generated: GenerativePreset;
  onGenerate: () => void;
  onSave: () => void;
  saved: boolean;
  onOpenSettings: () => void;
  onToggleFullscreen: () => void;
  fullscreen: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onRandom: () => void;
  onToggleFavorite: () => void;
  favorite: boolean;
  navigationToken: number;
  trackLines: readonly string[];
  djLines: readonly string[];
  trackCaption: string;
  trackStyle: TrackTextStyle;
  trackBlend: TrackBlendMode;
}

export const VisualizationStage: React.FC<VisualizationStageProps> = ({
  family,
  audio,
  manager,
  milkdropId,
  onMilkdropId,
  generated,
  onGenerate,
  onSave,
  saved,
  onOpenSettings,
  onToggleFullscreen,
  fullscreen,
  onPrevious,
  onNext,
  onRandom,
  onToggleFavorite,
  favorite,
  navigationToken,
  trackLines,
  djLines,
  trackCaption,
  trackStyle,
  trackBlend,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busRef = useRef(new AudioAnalysisBus());
  const perfRef = useRef(new PerformanceMonitor());
  const milkRef = useRef<MilkDropEngine | null>(null);
  const generativeRef = useRef<GenerativeEngine | null>(null);
  const trackCanvasRef = useRef<HTMLCanvasElement>(null);
  const trackEngineRef = useRef<TrackTextEngine | null>(null);
  const trackDrawRef = useRef({ djs: djLines, track: trackLines, style: trackStyle, blend: trackBlend });
  trackDrawRef.current = { djs: djLines, track: trackLines, style: trackStyle, blend: trackBlend };
  const [controls, setControls] = useState(true);
  const [message, setMessage] = useState('');
  const [perfText, setPerfText] = useState('');
  const [engineEpoch, setEngineEpoch] = useState(0);
  const hideTimer = useRef<number>(0);
  const skips = useRef(0);
  const lastPerfUi = useRef(0);

  const library = useMemo(() => ({
    read: readMilkdropFile,
    markIncompatible: (id: string) => manager.markIncompatible(id),
  }), [manager]);

  useEffect(() => {
    const node = rootRef.current;
    const canvas = canvasRef.current;
    if (!node || !canvas) return;
    let stopped = false;
    const perf = perfRef.current;
    perf.renderer = family === 'audio-rhythmic' ? 'webgl2-milkdrop' : 'webgl2-generative';

    const resize = () => {
      const rect = node.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const dpr = window.devicePixelRatio || 1;
      milkRef.current?.resize(width, height, dpr);
      generativeRef.current?.resize(width, height, dpr);
      trackEngineRef.current?.resize(width, height, dpr);
    };

    const start = async () => {
      try {
        const context = await audio.getAudioContext();
        if (stopped) return;
        if (family === 'audio-rhythmic') {
          const engine = new MilkDropEngine(canvas, context, library);
          engine.setFrameFailureHandler((id) => {
            skips.current += 1;
            if (skips.current >= 8) {
              setMessage('Preset incompatible. No se encontró otro preset reproducible en esta secuencia.');
              return;
            }
            const next = manager.nextId(collectionOf(id), id);
            if (next) {
              setMessage('Preset incompatible. Pasando al siguiente.');
              onMilkdropId(next);
            }
          });
          await engine.init(audio.getAudioTap());
          if (stopped) {
            engine.dispose();
            return;
          }
          milkRef.current = engine;
        } else {
          const engine = new GenerativeEngine(canvas);
          engine.init();
          engine.setPreset(generated);
          generativeRef.current = engine;
        }
        resize();
        setEngineEpoch((value) => value + 1);
      } catch (error) {
        if (!stopped) {
          setMessage(error instanceof Error ? error.message : 'No se pudo iniciar el visualizador');
        }
      }
    };

    void start();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    let last = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      if (stopped) return;
      const elapsed = (now - last) / 1000;
      last = now;
      const delta = Math.min(0.05, Math.max(0, elapsed));
      if (!document.hidden) {
        const audioStarted = performance.now();
        const analysis = busRef.current.update(audio.getFrameData(), delta, audio.getSourceType() === 'demo');
        const audioMs = performance.now() - audioStarted;
        if (family === 'audio-rhythmic') {
          const tap = audio.getAudioTap();
          if (tap) milkRef.current?.connectAudio(tap);
          milkRef.current?.render(analysis);
        } else generativeRef.current?.render(analysis);
        const trackDraw = trackDrawRef.current;
        trackEngineRef.current?.setBlend(trackDraw.blend);
        trackEngineRef.current?.render(analysis, { djs: trackDraw.djs, track: trackDraw.track }, trackDraw.style);
        perf.presetLoadMs = milkRef.current?.presetLoadMs() ?? 0;
        perf.sample(elapsed, audioMs);
        if (import.meta.env.DEV && now - lastPerfUi.current > 250) {
          lastPerfUi.current = now;
          const sample = perf.snapshot();
          setPerfText(`${sample.fps.toFixed(0)} fps  ${sample.frameTimeMs.toFixed(1)} ms  audio ${sample.audioMs.toFixed(2)} ms  ${sample.renderer}`);
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      milkRef.current?.dispose();
      generativeRef.current?.dispose();
      milkRef.current = null;
      generativeRef.current = null;
    };
  }, [audio, family, library, manager, onMilkdropId]);

  useEffect(() => {
    skips.current = 0;
  }, [navigationToken]);

  useEffect(() => {
    const canvas = trackCanvasRef.current;
    const node = rootRef.current;
    if (!canvas || !node) return;
    const engine = new TrackTextEngine(canvas);
    engine.init();
    trackEngineRef.current = engine;
    const rect = node.getBoundingClientRect();
    engine.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    return () => {
      engine.dispose();
      if (trackEngineRef.current === engine) trackEngineRef.current = null;
    };
  }, []);

  useEffect(() => {
    setMessage('');
  }, [family]);

  useEffect(() => {
    generativeRef.current?.setPreset(generated);
  }, [generated, engineEpoch]);

  useEffect(() => {
    if (family !== 'audio-rhythmic' || !milkdropId) return;
    let cancelled = false;
    const load = async () => {
      const engine = milkRef.current;
      const record = manager.get(milkdropId);
      if (!engine || !record || record.type !== 'milkdrop') return;
      setMessage('Cargando preset…');
      try {
        await engine.loadPreset(record);
        if (cancelled) return;
        skips.current = 0;
        setMessage(record.name);
      } catch (error) {
        if (cancelled) return;
        skips.current += 1;
        const detail = error instanceof Error ? error.message : 'Preset incompatible';
        if (detail.includes('no está inicializado')) return;
        console.error('[MilkDrop]', record.id, detail);
        manager.markIncompatible(record.id);
        if (skips.current >= 8) {
          setMessage('Preset incompatible. No se encontró otro preset reproducible en esta secuencia.');
          return;
        }
        const collection = collectionOf(record.id);
        const next = manager.nextId(collection, record.id);
        if (next && next !== record.id) {
          setMessage('Preset incompatible. Pasando al siguiente.');
          onMilkdropId(next);
        } else {
          setMessage('Preset incompatible');
        }
      }
    };
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [family, milkdropId, manager, onMilkdropId, engineEpoch]);

  const reveal = () => {
    setControls(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControls(false), fullscreen ? 1800 : 2600);
  };

  useEffect(() => {
    hideTimer.current = window.setTimeout(() => setControls(false), 2600);
    return () => window.clearTimeout(hideTimer.current);
  }, []);

  return (
    <div
      ref={rootRef}
      id="visualization-stage"
      className="relative w-full h-full bg-black overflow-hidden"
      onMouseMove={reveal}
    >
      <canvas key={family} ref={canvasRef} id="visualization-canvas" className="absolute inset-0 w-full h-full block" />
      <canvas ref={trackCanvasRef} id="track-text-canvas" className="absolute inset-0 w-full h-full block pointer-events-none z-10" />
      <div
        className={`absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-3 p-3 transition-opacity duration-200 ${
          controls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="min-w-0 px-3 py-2 rounded-md bg-neutral-950/80 border border-white/10 backdrop-blur-md text-xs font-mono text-neutral-200">
          <div className="truncate">{message || (family === 'generative' ? generated.name : 'Audio rítmico')}</div>
          {trackCaption && <div className="truncate text-white">{trackCaption}</div>}
          {family === 'generative' && <div className="text-cyan-300">Seed {generated.seed}</div>}
        </div>
        <div className="flex items-center gap-1 px-1.5 py-1.5 rounded-md bg-neutral-950 border border-cyan-400/50 shadow-xl">
          {family === 'audio-rhythmic' && (
            <>
              <StageButton id="stage-prev" title="Anterior" onClick={onPrevious}><SkipBack className="w-4 h-4" /><span>Anterior</span></StageButton>
              <StageButton id="stage-next" title="Siguiente" onClick={onNext}><SkipForward className="w-4 h-4" /><span>Siguiente</span></StageButton>
              <StageButton id="stage-random" title="Aleatorio" onClick={onRandom}><Dices className="w-4 h-4" /><span>Aleatorio</span></StageButton>
              <StageButton id="stage-favorite" title="Favorito" onClick={onToggleFavorite}>
                <Star className={`w-4 h-4 ${favorite ? 'fill-amber-300 text-amber-300' : ''}`} />
                <span>Favorito</span>
              </StageButton>
            </>
          )}
          {family === 'generative' && (
            <>
              <StageButton id="stage-generate" title="Generar" onClick={onGenerate}>
                <Sparkles className="w-4 h-4" />
                <span className="text-[11px]">Generate</span>
              </StageButton>
              <StageButton id="stage-save" title="Guardar preset" onClick={onSave}>
                <span className="text-[11px]">{saved ? 'Saved' : 'Save'}</span>
              </StageButton>
            </>
          )}
          <StageButton id="stage-settings" title="Ajustes" onClick={onOpenSettings}><Settings className="w-4 h-4" /><span>Ajustes</span></StageButton>
          <StageButton id="stage-fullscreen" title={fullscreen ? 'Salir' : 'Pantalla completa'} onClick={onToggleFullscreen}>
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span>{fullscreen ? 'Salir' : 'Completa'}</span>
          </StageButton>
        </div>
      </div>
      {import.meta.env.DEV && perfText && (
        <div className="absolute top-2 left-2 z-10 px-2 py-1 rounded bg-black/55 text-[10px] font-mono text-emerald-300 pointer-events-none">
          {perfText}
        </div>
      )}
    </div>
  );
};

function collectionOf(id: string): PresetCollectionId {
  if (id.startsWith('community:')) return 'community';
  if (id.startsWith('user:')) return 'user';
  return 'original';
}

const StageButton: React.FC<{ id: string; title: string; onClick: () => void; children: React.ReactNode }> = ({
  id,
  title,
  onClick,
  children,
}) => (
  <button
    id={id}
    type="button"
    title={title}
    onClick={onClick}
    className="flex items-center gap-1 min-h-8 px-2.5 py-1.5 rounded-md border border-white/20 bg-white/10 text-white text-[11px] font-mono hover:bg-cyan-500/30 hover:border-cyan-300"
  >
    {children}
  </button>
);
