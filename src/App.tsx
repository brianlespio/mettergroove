/**
 * Mettergroove
 * AudioEngine -> AudioAnalysisBus -> VisualizationEngine
 * Analyzers keep the existing bar. Audio-rhythmic and generative replace that canvas.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine, AudioSourceType } from './audio/AudioEngine';
import { displayCaptureErrorMessage, detectAudioSourceAvailability } from './audio/audioSourceAvailability';
import { AudioVisualizerBar } from './components/AudioVisualizerBar';
import { SettingsModal } from './components/SettingsModal';
import { LocalPresetStore } from './presets/LocalPresetStore';
import { PresetManager } from './presets/PresetManager';
import type { PresetCollectionId, UserPresetRecord } from './presets/types';
import { loadPreferences, savePreferences } from './settings/persistence';
import { listAudioInputs } from './audio/audioInputs';
import { isTrackFormat, trackCaption, trackLines, type TrackFormat } from './traktor/formatTrack';
import { EMPTY_TRACK, TRAKTOR_PORT, type AudioInputDevice, type TrackBlendMode, type TrackTextStyle, type TraktorLinkState } from './traktor/types';
import { VisualizerConfig } from './types/audio';
import { createGenerativePreset, randomSeed, type GenerativePreset } from './visualization/generative/GenerativePreset';
import type { VisualizationFamily } from './visualization/types';
import { PresetBrowser } from './ui/PresetBrowser';
import { VisualizationStage } from './ui/VisualizationStage';

const DEFAULT_CONFIG: VisualizerConfig = {
  mode: 'waveform',
  colorScheme: 'spectrum',
  height: 115,
  decayRate: 160,
  smoothing: 0.65,
  waveformStyle: 'scrolling',
  waveformShape: 'smooth-curves',
  showStereometer: false,
  showFrequencyGrid: true,
  selectedBandHz: null,
  showPeakHold: false,
  peakHoldDecay: 'slow',
  showBpmOverlay: true,
  showBeatCenterLine: true,
};

function collectionOf(id: string | null): PresetCollectionId {
  if (!id) return 'original';
  if (id.startsWith('community:')) return 'community';
  if (id.startsWith('user:')) return 'user';
  return 'original';
}

export default function App() {
  const stored = useMemo(() => loadPreferences(), []);
  const engine = useMemo(() => new AudioEngine(), []);
  const manager = useMemo(
    () => new PresetManager(new LocalPresetStore(), stored?.favoriteIds ?? []),
    [stored]
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const familyRef = useRef<VisualizationFamily>(stored?.family ?? 'analyzer');
  const heightBeforeFullscreen = useRef(stored?.config.height ?? DEFAULT_CONFIG.height);

  const [sourceType, setSourceType] = useState<AudioSourceType>('none');
  const [volume, setVolume] = useState<number>(0.85);
  const [smoothing, setSmoothing] = useState<number>(stored?.config.smoothing ?? 0.65);
  const [height, setHeight] = useState<number>(stored?.config.height ?? 115);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Listo para reproducir');
  const [family, setFamily] = useState<VisualizationFamily>(stored?.family ?? 'analyzer');
  const [milkdropId, setMilkdropId] = useState<string | null>(stored?.milkdropPresetId ?? null);
  const [generatedId, setGeneratedId] = useState<string | null>(stored?.generatedPresetId ?? null);
  const [generated, setGenerated] = useState<GenerativePreset>(() => {
    const saved = stored?.generatedPresetId ? manager.get(stored.generatedPresetId) : null;
    if (saved && saved.type === 'generated' && 'preset' in saved) return (saved as UserPresetRecord).preset;
    return createGenerativePreset(randomSeed());
  });
  const [fullscreen, setFullscreen] = useState(false);
  const [barWidth, setBarWidth] = useState<number | string>('100%');
  const [audioInputs, setAudioInputs] = useState<AudioInputDevice[]>([]);
  const [inputId, setInputId] = useState<string | null>(stored?.audioInputId ?? null);
  const [showTrackText, setShowTrackText] = useState(stored?.showTrackText !== false);
  const [trackFormat, setTrackFormat] = useState<TrackFormat>(
    stored?.trackFormat && isTrackFormat(stored.trackFormat) && stored.trackFormat !== '{{artist}} — {{title}}'
      ? stored.trackFormat
      : '{{title}}'
  );
  const [trackStyle, setTrackStyle] = useState<TrackTextStyle>(stored?.trackStyle ?? 'pulse');
  const [trackBlend, setTrackBlend] = useState<TrackBlendMode>(stored?.trackBlend ?? 'screen');
  const [djName, setDjName] = useState(stored?.djName ?? '');
  const [djName2, setDjName2] = useState(stored?.djName2 ?? '');
  const [traktor, setTraktor] = useState<TraktorLinkState>({
    ...EMPTY_TRACK,
    listening: false,
    connected: false,
    port: TRAKTOR_PORT,
    error: '',
  });
  const [revision, setRevision] = useState(0);
  const [navigationToken, setNavigationToken] = useState(0);
  const [config, setConfig] = useState<VisualizerConfig>({
    ...DEFAULT_CONFIG,
    ...(stored?.config ?? {}),
    height: stored?.config.height ?? 115,
    smoothing: stored?.config.smoothing ?? 0.65,
  });
  const availability = useMemo(() => detectAudioSourceAvailability(), []);

  familyRef.current = family;

  useEffect(() => manager.subscribe(() => setRevision((value) => value + 1)), [manager]);

  useEffect(() => {
    const interval = setInterval(() => setSourceType(engine.getSourceType()), 200);
    return () => clearInterval(interval);
  }, [engine]);

  useEffect(() => {
    if (family !== 'audio-rhythmic' && !isSettingsOpen) return;
    manager.ensureCatalog()
      .then(() => {
        setMilkdropId((current) => current ?? manager.startupId('original'));
      })
      .catch((error: unknown) => {
        setStatusMessage(error instanceof Error ? error.message : 'Índice MilkDrop no disponible');
      });
  }, [family, isSettingsOpen, manager]);

  useEffect(() => {
    savePreferences({
      version: 1,
      family,
      config: { ...config, height, smoothing },
      milkdropPresetId: milkdropId,
      generatedPresetId: generatedId,
      audioSource: sourceType,
      fullscreen,
      favoriteIds: manager.favoriteIds(),
      audioInputId: inputId,
      showTrackText,
      trackFormat,
      trackStyle,
      trackBlend,
      djName,
      djName2,
    });
  }, [family, config, height, smoothing, milkdropId, generatedId, sourceType, fullscreen, revision, manager, inputId, showTrackText, trackFormat, trackStyle, trackBlend, djName, djName2]);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const response = await fetch('/traktor/now-playing');
        if (!response.ok) throw new Error('sin puente');
        const next = await response.json() as TraktorLinkState;
        if (stopped) return;
        setTraktor((current) => (
          current.artist === next.artist
          && current.title === next.title
          && current.album === next.album
          && current.status === next.status
          && current.connected === next.connected
          && current.listening === next.listening
          && current.error === next.error
          && current.port === next.port
            ? current
            : next
        ));
      } catch {
        if (!stopped) {
          setTraktor((current) => (
            current.error === 'Arranca con npm run dev para recibir a Traktor.'
              ? current
              : { ...current, listening: false, connected: false, error: 'Arranca con npm run dev para recibir a Traktor.' }
          ));
        }
      }
    };
    void tick();
    const timer = window.setInterval(() => { void tick(); }, 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onChange = () => {
      const active = document.fullscreenElement === rootRef.current;
      setFullscreen(active);
      if (familyRef.current !== 'analyzer') return;
      if (active) setHeight(window.innerHeight);
      else setHeight(heightBeforeFullscreen.current);
    };
    const onResize = () => {
      if (document.fullscreenElement === rootRef.current && familyRef.current === 'analyzer') {
        setHeight(window.innerHeight);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const runAudio = useCallback(async (action: () => Promise<void>, success: string) => {
    try {
      await action();
      setSourceType(engine.getSourceType());
      setStatusMessage(success);
    } catch (error) {
      console.error(error);
      setStatusMessage(displayCaptureErrorMessage(error));
    }
  }, [engine]);

  const handlePlayDemo = () => runAudio(() => engine.playDemo(), 'Groove estéreo reproduciendo...');
  const handleStartMic = () => runAudio(() => engine.startMicrophone(), 'Micrófono / Line-In activo');
  const handleStartTab = () => runAudio(
    () => engine.startDisplayCapture('tab'),
    'Audio de pestaña activo. Si no suena, vuelve a compartir y marca el audio.'
  );
  const handleStartSystem = () => runAudio(
    () => engine.startDisplayCapture('system'),
    'Captura de sistema solicitada. El navegador debe incluir la pista de audio.'
  );

  const handleStop = () => {
    engine.stopCurrentSource();
    setSourceType('none');
    setStatusMessage('Audio detenido');
  };

  const handleRefreshInputs = () => {
    void listAudioInputs()
      .then(setAudioInputs)
      .catch((error: unknown) => {
        setStatusMessage(error instanceof Error ? error.message : 'No se pudieron listar las placas');
      });
  };

  const handleSelectInput = (deviceId: string) => {
    setInputId(deviceId);
    void runAudio(() => engine.startMicrophone(deviceId), 'Audio de la placa seleccionado');
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    engine.setVolume(newVol);
  };

  const handleSmoothingChange = (newSmooth: number) => {
    setSmoothing(newSmooth);
    engine.setSmoothing(newSmooth);
    setConfig((prev) => ({ ...prev, smoothing: newSmooth }));
  };

  const handleFamily = (next: VisualizationFamily) => {
    setFamily(next);
    if (next === 'audio-rhythmic') {
      void manager.ensureCatalog().then(() => {
        setMilkdropId((current) => current ?? manager.startupId('original'));
      });
    }
  };

  const selectPreset = (id: string) => {
    const record = manager.get(id);
    if (!record) return;
    setNavigationToken((value) => value + 1);
    if (record.type === 'generated' && 'preset' in record) {
      setGenerated(record.preset);
      setGeneratedId(record.id);
      setFamily('generative');
      return;
    }
    setMilkdropId(id);
    setFamily('audio-rhythmic');
  };

  const stepMilkdrop = (direction: 'next' | 'previous' | 'random') => {
    const collection = collectionOf(milkdropId);
    const id = direction === 'next'
      ? manager.nextId(collection, milkdropId)
      : direction === 'previous'
        ? manager.previousId(collection, milkdropId)
        : manager.randomId(collection, milkdropId);
    if (!id) {
      setStatusMessage('No hay presets compatibles en esta colección');
      return;
    }
    setNavigationToken((value) => value + 1);
    setMilkdropId(id);
  };

  const handleGenerate = () => {
    const preset = createGenerativePreset(randomSeed());
    setGenerated(preset);
    setGeneratedId(null);
    setFamily('generative');
    setStatusMessage(`Generado ${preset.seed}`);
  };

  const handleSave = () => {
    try {
      const record = manager.saveGenerated(generated);
      setGeneratedId(record.id);
      setStatusMessage(`Guardado en My Presets: ${record.name}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'No se pudo guardar el preset');
    }
  };

  const toggleFullscreen = async () => {
    const node = rootRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      heightBeforeFullscreen.current = height;
      await node.requestFullscreen();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Pantalla completa no disponible');
    }
  };

  const selectedVisualId = family === 'generative' ? generatedId : milkdropId;
  const favorite = selectedVisualId ? manager.isFavorite(selectedVisualId) : false;
  const favoriteRecords = manager.filter('favorites', '');
  const djLines = [djName, djName2].map((name) => name.trim()).filter(Boolean);
  const visibleTrack = showTrackText ? trackLines(trackFormat, traktor.artist, traktor.title) : [];
  const visibleCaption = [djLines.join(' / '), showTrackText ? trackCaption(trackFormat, traktor.artist, traktor.title) : '']
    .filter(Boolean)
    .join(' · ');
  const visualizationPanel = !isSettingsOpen || family === 'analyzer' ? null : (
    <div className="space-y-3">
      {family === 'audio-rhythmic' && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => stepMilkdrop('previous')} className="px-3 py-1.5 rounded-md border border-cyan-400/40 bg-cyan-500/15 text-cyan-100 font-mono">Anterior</button>
          <button type="button" onClick={() => stepMilkdrop('next')} className="px-3 py-1.5 rounded-md border border-cyan-400/40 bg-cyan-500/15 text-cyan-100 font-mono">Siguiente</button>
          <button type="button" onClick={() => stepMilkdrop('random')} className="px-3 py-1.5 rounded-md border border-cyan-400/40 bg-cyan-500/15 text-cyan-100 font-mono">Aleatorio</button>
        </div>
      )}
      {family === 'generative' && (
        <div className="flex flex-wrap items-center gap-2 font-mono">
          <button id="settings-generate" type="button" onClick={handleGenerate} className="px-3 py-1.5 rounded-md bg-cyan-500 text-neutral-950 border border-cyan-300 font-semibold">Generate</button>
          <span className="text-cyan-300">Seed {generated.seed}</span>
          <button id="settings-save" type="button" onClick={handleSave} className="px-3 py-1.5 rounded-md border border-white/30 bg-white/10 text-white">Save</button>
          <span className="text-neutral-500">{generated.algorithm} · fórmula {(generated.parameters.formula ?? 0) + 1}</span>
        </div>
      )}
      <button
        type="button"
        onClick={() => selectedVisualId && manager.toggleFavorite(selectedVisualId)}
        className="px-3 py-1.5 rounded-md border border-amber-300/40 bg-amber-400/15 text-amber-100 font-mono"
      >
        {favorite ? 'En favoritas' : 'Marcar favorita'}
      </button>
      <div id="favorite-list" className="rounded-md border border-amber-300/30 bg-black/30 p-2 space-y-1">
        <div className="text-[11px] font-mono uppercase tracking-wider text-amber-200">Visuales favoritas</div>
        {favoriteRecords.length === 0 ? (
          <p className="text-[10px] font-mono text-neutral-500">Esta lista está aparte del catálogo. Marca la visual que estás viendo.</p>
        ) : (
          <div className="max-h-28 overflow-y-auto space-y-1">
            {favoriteRecords.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => selectPreset(preset.id)}
                className={`block w-full text-left px-2 py-1 rounded font-mono text-[11px] ${
                  preset.id === selectedVisualId ? 'bg-amber-400/20 text-white' : 'text-neutral-200 hover:bg-white/5'
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <PresetBrowser
        manager={manager}
        revision={revision}
        selectedId={family === 'generative' ? generatedId : milkdropId}
        onSelect={selectPreset}
      />
    </div>
  );

  return (
    <div
      ref={rootRef}
      id="app-root"
      className={
        family === 'analyzer'
          ? 'w-screen h-screen overflow-hidden bg-[#06080c] flex items-center justify-center p-2 sm:p-4 select-none'
          : 'w-screen h-screen overflow-hidden bg-black select-none'
      }
    >
      {family === 'analyzer' ? (
        <div className="w-full max-w-full flex items-center justify-center">
          <AudioVisualizerBar
            engine={engine}
            height={height}
            onHeightChange={setHeight}
            width={barWidth}
            onWidthChange={setBarWidth}
            sourceType={sourceType}
            onPlayDemo={() => { void handlePlayDemo(); }}
            onStopAudio={handleStop}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onToggleFullscreen={() => { void toggleFullscreen(); }}
            fullscreen={fullscreen}
            config={config}
            setConfig={setConfig}
          />
        </div>
      ) : (
        <VisualizationStage
          family={family}
          audio={engine}
          manager={manager}
          milkdropId={milkdropId}
          onMilkdropId={setMilkdropId}
          generated={generated}
          onGenerate={handleGenerate}
          onSave={handleSave}
          saved={generatedId !== null}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onToggleFullscreen={() => { void toggleFullscreen(); }}
          fullscreen={fullscreen}
          onPrevious={() => stepMilkdrop('previous')}
          onNext={() => stepMilkdrop('next')}
          onRandom={() => stepMilkdrop('random')}
          onToggleFavorite={() => selectedVisualId && manager.toggleFavorite(selectedVisualId)}
          favorite={favorite}
          navigationToken={navigationToken}
          trackLines={visibleTrack}
          djLines={djLines}
          trackCaption={visibleCaption}
          trackStyle={trackStyle}
          trackBlend={trackBlend}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        engine={engine}
        sourceType={sourceType}
        volume={volume}
        onVolumeChange={handleVolumeChange}
        smoothing={smoothing}
        onSmoothingChange={handleSmoothingChange}
        config={config}
        onConfigChange={setConfig}
        currentHeight={height}
        onHeightChange={setHeight}
        currentWidth={barWidth}
        onWidthChange={setBarWidth}
        onPlayDemo={() => { void handlePlayDemo(); }}
        onStartMic={() => { void handleStartMic(); }}
        onStopAudio={handleStop}
        statusMessage={statusMessage}
        family={family}
        onFamilyChange={handleFamily}
        onStartTab={() => { void handleStartTab(); }}
        onStartSystem={() => { void handleStartSystem(); }}
        displayCaptureAvailable={availability.displayCapture}
        onToggleFullscreen={() => { void toggleFullscreen(); }}
        fullscreen={fullscreen}
        visualizationPanel={visualizationPanel}
        audioInputs={audioInputs}
        selectedInputId={inputId}
        onRefreshInputs={handleRefreshInputs}
        onSelectInput={handleSelectInput}
        traktor={traktor}
        showTrackText={showTrackText}
        onShowTrackText={setShowTrackText}
        trackFormat={trackFormat}
        onTrackFormat={setTrackFormat}
        trackStyle={trackStyle}
        onTrackStyle={setTrackStyle}
        trackBlend={trackBlend}
        onTrackBlend={setTrackBlend}
        djName={djName}
        djName2={djName2}
        onDjName={setDjName}
        onDjName2={setDjName2}
      />
    </div>
  );
}
