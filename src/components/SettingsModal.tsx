import React, { useRef } from 'react';
import { AudioEngine, AudioSourceType } from '../audio/AudioEngine';
import { VisualizerConfig, ColorSchemeId, WaveformShape } from '../types/audio';
import type { VisualizationFamily } from '../visualization/types';
import { VISUALIZATION_FAMILIES } from '../visualization/types';
import { TRAKTOR_PORT, type AudioInputDevice, type TrackBlendMode, type TrackTextStyle, type TraktorLinkState } from '../traktor/types';
import { TRACK_FORMATS, type TrackFormat } from '../traktor/formatTrack';
import { COLOR_SCHEMES } from '../visual/colorSchemes';
import { 
  X, 
  Play, 
  Square, 
  Mic, 
  Upload, 
  Volume2, 
  SlidersHorizontal, 
  Palette, 
  Layers, 
  Radio, 
  Activity, 
  Sliders,
  Check,
  Maximize2,
  Minimize2,
  Info,
  Waves,
  Monitor
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  engine: AudioEngine;
  sourceType: AudioSourceType;
  volume: number;
  onVolumeChange: (vol: number) => void;
  smoothing: number;
  onSmoothingChange: (smooth: number) => void;
  config: VisualizerConfig;
  onConfigChange: (updater: (prev: VisualizerConfig) => VisualizerConfig) => void;
  currentHeight: number;
  onHeightChange: (h: number) => void;
  currentWidth: number | string;
  onWidthChange: (w: number | string) => void;
  onPlayDemo: () => void;
  onStartMic: () => void;
  onStopAudio: () => void;
  statusMessage: string;
  family: VisualizationFamily;
  onFamilyChange: (family: VisualizationFamily) => void;
  onStartTab: () => void;
  onStartSystem: () => void;
  displayCaptureAvailable: boolean;
  onToggleFullscreen: () => void;
  fullscreen: boolean;
  visualizationPanel: React.ReactNode;
  audioInputs: AudioInputDevice[];
  selectedInputId: string | null;
  onRefreshInputs: () => void;
  onSelectInput: (deviceId: string) => void;
  traktor: TraktorLinkState;
  showTrackText: boolean;
  onShowTrackText: (enabled: boolean) => void;
  trackFormat: TrackFormat;
  onTrackFormat: (format: TrackFormat) => void;
  trackStyle: TrackTextStyle;
  onTrackStyle: (style: TrackTextStyle) => void;
  trackBlend: TrackBlendMode;
  onTrackBlend: (blend: TrackBlendMode) => void;
  djName: string;
  djName2: string;
  onDjName: (name: string) => void;
  onDjName2: (name: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  engine,
  sourceType,
  volume,
  onVolumeChange,
  smoothing,
  onSmoothingChange,
  config,
  onConfigChange,
  currentHeight,
  onHeightChange,
  currentWidth,
  onWidthChange,
  onPlayDemo,
  onStartMic,
  onStopAudio,
  statusMessage,
  family,
  onFamilyChange,
  onStartTab,
  onStartSystem,
  displayCaptureAvailable,
  onToggleFullscreen,
  fullscreen,
  visualizationPanel,
  audioInputs,
  selectedInputId,
  onRefreshInputs,
  onSelectInput,
  traktor,
  showTrackText,
  onShowTrackText,
  trackFormat,
  onTrackFormat,
  trackStyle,
  onTrackStyle,
  trackBlend,
  onTrackBlend,
  djName,
  djName2,
  onDjName,
  onDjName2,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await engine.loadAudioFile(file);
    }
  };

  const officialDeckModes: ColorSchemeId[] = ['spectrum', 'infrared', 'x-ray', 'ultraviolet'];
  const additionalModes: ColorSchemeId[] = ['studio', 'cyberpunk'];

  return (
    <div
      id="settings-modal-backdrop"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="settings-modal-card"
        className="w-full max-w-2xl max-h-[92dvh] overflow-y-auto overscroll-contain bg-[#0d0f17] border border-white/15 rounded-t-2xl sm:rounded-xl shadow-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 text-neutral-200 font-sans select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <h2 className="text-sm font-semibold tracking-wide text-white uppercase font-mono truncate">
              Configuración del Visualizador
            </h2>
          </div>
          <button
            id="btn-close-settings"
            onClick={onClose}
            className="min-h-11 min-w-11 flex items-center justify-center rounded-md text-neutral-400 hover:text-white hover:bg-white/10 transition-colors touch-manipulation"
            title="Cerrar configuración"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-5 text-xs">
          <div>
            <label className="block text-[11px] font-mono text-neutral-400 uppercase tracking-wider mb-2">
              Visualization
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {VISUALIZATION_FAMILIES.map((mode) => (
                <button
                  key={mode.id}
                  id={`viz-family-${mode.id}`}
                  type="button"
                  onClick={() => onFamilyChange(mode.id)}
                  className={`p-2.5 rounded-lg border text-left ${
                    family === mode.id
                      ? 'bg-cyan-500/20 border-cyan-400 text-white'
                      : 'bg-white/5 border-white/10 text-neutral-400'
                  }`}
                >
                  <span className="block font-mono text-[11px] text-cyan-200">{mode.label}</span>
                  <span className="block text-[10px] text-neutral-500 mt-1">{mode.description}</span>
                </button>
              ))}
            </div>
            <button
              id="viz-fullscreen"
              type="button"
              onClick={onToggleFullscreen}
              className="mt-2 px-3 py-1.5 rounded border border-white/10 bg-white/5 font-mono text-[11px] text-neutral-200"
            >
              {fullscreen ? 'Salir de pantalla completa' : 'Entrar en pantalla completa'}
            </button>
          </div>

          {visualizationPanel}

          <details open className="rounded-lg border border-cyan-400/30 bg-white/[0.03] p-3">
            <summary className="cursor-pointer text-[11px] font-mono text-cyan-200 uppercase tracking-wider">
              De dónde tomar el audio
            </summary>
            <p className="mt-2 text-[10px] font-mono text-neutral-500 leading-relaxed">
              La lista muestra las entradas que el navegador puede abrir: micrófono, line-in, Stereo Mix o el loopback de la placa donde suena Traktor. Una salida pura no aparece aquí.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
              <button
                id="modal-btn-demo"
                onClick={onPlayDemo}
                className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-lg border transition-all ${
                  sourceType === 'demo'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                    : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                <span className="font-medium text-[11px]">Demo Groove</span>
              </button>

              <button
                id="modal-btn-mic"
                onClick={onStartMic}
                className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-lg border transition-all ${
                  sourceType === 'mic'
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                }`}
              >
                <Mic className="w-4 h-4" />
                <span className="font-medium text-[11px]">Micrófono</span>
              </button>

              <button
                id="modal-btn-file"
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-lg border transition-all ${
                  sourceType === 'file'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span className="font-medium text-[11px]">Cargar Archivo</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleFileUpload}
              />

              <button
                id="modal-btn-tab"
                type="button"
                disabled={!displayCaptureAvailable}
                onClick={onStartTab}
                className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-lg border transition-all ${
                  sourceType === 'tab'
                    ? 'bg-violet-500/20 border-violet-400 text-violet-200'
                    : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10 disabled:opacity-40'
                }`}
              >
                <Radio className="w-4 h-4" />
                <span className="font-medium text-[11px]">Pestaña</span>
              </button>

              <button
                id="modal-btn-system"
                type="button"
                disabled={!displayCaptureAvailable}
                onClick={onStartSystem}
                className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-lg border transition-all ${
                  sourceType === 'system'
                    ? 'bg-violet-500/20 border-violet-400 text-violet-200'
                    : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10 disabled:opacity-40'
                }`}
              >
                <Monitor className="w-4 h-4" />
                <span className="font-medium text-[11px]">Sistema</span>
              </button>

              <button
                id="modal-btn-none"
                type="button"
                onClick={onStopAudio}
                className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-lg border transition-all ${
                  sourceType === 'none'
                    ? 'bg-white/15 border-white/40 text-white'
                    : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                }`}
              >
                <Square className="w-4 h-4" />
                <span className="font-medium text-[11px]">Ninguna</span>
              </button>
            </div>
            {!displayCaptureAvailable && (
              <p className="mt-2 text-[10px] font-mono text-neutral-500">
                Este navegador no expone captura de audio de pestaña o del sistema.
              </p>
            )}

            {sourceType !== 'none' && (
              <div className="mt-2 flex items-center justify-between p-2 rounded bg-black/30 border border-white/5 font-mono text-[11px]">
                <span className="text-neutral-400">{statusMessage}</span>
                <button
                  onClick={onStopAudio}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Detener</span>
                </button>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">Placas de entrada</span>
              <button
                id="audio-device-refresh"
                type="button"
                onClick={onRefreshInputs}
                className="px-2.5 py-1 rounded-md border border-cyan-300/50 bg-cyan-500/20 text-[11px] font-mono text-cyan-100"
              >
                Ver placas
              </button>
            </div>
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
              {audioInputs.length === 0 ? (
                <p className="text-[10px] font-mono text-neutral-500">Pulsa Ver placas para pedir permiso y listar los dispositivos.</p>
              ) : audioInputs.map((device) => (
                <button
                  key={device.deviceId}
                  type="button"
                  onClick={() => onSelectInput(device.deviceId)}
                  className={`block w-full text-left px-2.5 py-1.5 rounded-md border font-mono text-[11px] ${
                    selectedInputId === device.deviceId && sourceType === 'mic'
                      ? 'border-cyan-300 bg-cyan-500/20 text-white'
                      : 'border-white/15 bg-black/30 text-neutral-200 hover:border-cyan-300/50'
                  }`}
                >
                  {device.label}
                </button>
              ))}
            </div>
          </details>

          <details open className="rounded-lg border border-white/15 bg-white/[0.03] p-3">
            <summary className="cursor-pointer text-[11px] font-mono text-cyan-200 uppercase tracking-wider">
              Traktor — nombre del tema
            </summary>
            <p className="mt-2 text-[10px] font-mono text-neutral-400">
              {traktor.listening ? `Escuchando en 127.0.0.1:${traktor.port}` : 'Puente local apagado'}
              {traktor.connected ? ' · conectado' : ' · sin emisión'}
              {traktor.error ? ` · ${traktor.error}` : ''}
            </p>
            <p className="mt-1 text-sm font-mono text-white">
              {traktor.title || (traktor.connected ? 'Conectado. Carga otro tema: el nombre llega unos 10 segundos después, con el fader abierto.' : 'Todavía no llega el nombre')}
            </p>
            <p className="mt-2 text-[10px] font-mono text-neutral-500 leading-relaxed">
              En Traktor Pro 4 el casete no está en Preferences. Engranaje → Preferences → Global Settings: marca Show Global Section y en Right elige AUDIO RECORDER. Cierra Preferences. Arriba, en la franja del master, el botón de la derecha abre el Audio Recorder; dentro está Broadcast. Si queda fijo, está conectado. El nombre llega unos 10 segundos después de que el tema se oye, con el fader del canal abierto. Address 127.0.0.1, Port {traktor.port || TRAKTOR_PORT}, Format Ogg Vorbis al bitrate más bajo. Proxy vacío. El puente abre con npm run dev y no sale de este equipo.
            </p>
            <label className="mt-3 flex items-center gap-2 text-[11px] font-mono text-neutral-200">
              <input type="checkbox" checked={showTrackText} onChange={(event) => onShowTrackText(event.target.checked)} className="accent-cyan-400" />
              Mostrar el tema dentro de la visual
            </label>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-[10px] font-mono text-neutral-400">
                DJ en el centro
                <input
                  id="dj-name"
                  value={djName}
                  onChange={(event) => onDjName(event.target.value)}
                  placeholder="Nombre del DJ"
                  className="mt-1 w-full bg-black/50 border border-white/15 rounded px-2 py-1.5 text-sm text-white"
                />
              </label>
              <label className="text-[10px] font-mono text-neutral-400">
                Segundo DJ, debajo
                <input
                  id="dj-name-2"
                  value={djName2}
                  onChange={(event) => onDjName2(event.target.value)}
                  placeholder="Opcional"
                  className="mt-1 w-full bg-black/50 border border-white/15 rounded px-2 py-1.5 text-sm text-white"
                />
              </label>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="text-[10px] font-mono text-neutral-400">
                Formato
                <select
                  value={trackFormat}
                  onChange={(event) => onTrackFormat(event.target.value as TrackFormat)}
                  className="mt-1 w-full bg-black/50 border border-white/15 rounded px-2 py-1 text-neutral-100"
                >
                  {TRACK_FORMATS.map((format) => <option key={format} value={format}>{format}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-mono text-neutral-400">
                Deformación
                <select
                  value={trackStyle}
                  onChange={(event) => onTrackStyle(event.target.value as TrackTextStyle)}
                  className="mt-1 w-full bg-black/50 border border-white/15 rounded px-2 py-1 text-neutral-100"
                >
                  <option value="pulse">Pulso</option>
                  <option value="wave">Onda</option>
                  <option value="glitch">Glitch</option>
                </select>
              </label>
              <label className="text-[10px] font-mono text-neutral-400">
                Fusión
                <select
                  value={trackBlend}
                  onChange={(event) => onTrackBlend(event.target.value as TrackBlendMode)}
                  className="mt-1 w-full bg-black/50 border border-white/15 rounded px-2 py-1 text-neutral-100"
                >
                  <option value="screen">Screen</option>
                  <option value="normal">Encima</option>
                  <option value="multiply">Multiply</option>
                  <option value="difference">Difference</option>
                </select>
              </label>
            </div>
          </details>

          {/* Sliders: Volume & Ballistic Smoothing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-white/[0.03] rounded-lg border border-white/10">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="font-mono text-neutral-300 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-neutral-400" />
                  Volumen Maestro
                </span>
                <span className="font-mono text-cyan-400">{Math.round(volume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.2"
                step="0.05"
                value={volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="font-mono text-neutral-300 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-400" />
                  Suavizado (Decay)
                </span>
                <span className="font-mono text-emerald-400">{smoothing.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={smoothing}
                onChange={(e) => onSmoothingChange(parseFloat(e.target.value))}
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Mode Selector */}
          {family === 'analyzer' && <div>
            <label className="block text-[11px] font-mono text-neutral-400 uppercase tracking-wider mb-2">
              Modo de Visualización
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'combined', label: 'Todos', icon: Layers, desc: 'Onda, espectro, estéreo y dB' },
                { id: 'waveform', label: 'Waveform', icon: Activity, desc: 'DJ Deck Waveform' },
                { id: 'spectrum', label: 'Spectrum', icon: Sliders, desc: 'Espectro Fluido' },
                { id: 'stereo', label: 'Stereo', icon: Radio, desc: 'Goniometro L/R' },
                { id: 'levels', label: 'dB L/R', icon: Volume2, desc: 'Barras de volumen en dB' },
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = config.mode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => onConfigChange((prev) => ({ ...prev, mode: m.id as any }))}
                    className={`flex flex-col items-center p-2 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-cyan-500/20 border-cyan-400 text-white'
                        : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mb-1 ${isSelected ? 'text-cyan-400' : 'text-neutral-400'}`} />
                    <span className="font-mono font-medium text-[11px]">{m.label}</span>
                    <span className="text-[9px] text-neutral-500">{m.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>}

          {/* Waveform Geometry & Rounding Selector */}
          {family === 'analyzer' && <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                <Waves className="w-3.5 h-3.5 text-cyan-400" />
                Geometría & Suavizado de Onda
              </label>
              <span className="text-[10px] font-mono text-cyan-400/80">Anti-Aliasing High-Res</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="btn-shape-smooth-curves"
                onClick={() => onConfigChange((prev) => ({ ...prev, waveformShape: 'smooth-curves' }))}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  (config.waveformShape || 'smooth-curves') === 'smooth-curves'
                    ? 'bg-cyan-500/20 border-cyan-400 text-white'
                    : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-semibold text-cyan-300">
                    Contorno de deck
                  </span>
                  {(config.waveformShape || 'smooth-curves') === 'smooth-curves' && (
                    <Check className="w-3.5 h-3.5 text-cyan-400" />
                  )}
                </div>
                <p className="text-[10px] text-neutral-400 leading-snug">
                  Silueta continua de graves, medios y agudos, como la onda de 3 bandas de un deck.
                </p>
              </button>

              <button
                type="button"
                id="btn-shape-rounded-bars"
                onClick={() => onConfigChange((prev) => ({ ...prev, waveformShape: 'rounded-bars' }))}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  config.waveformShape === 'rounded-bars'
                    ? 'bg-cyan-500/20 border-cyan-400 text-white'
                    : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-semibold text-cyan-300">
                    Detalle fino
                  </span>
                  {config.waveformShape === 'rounded-bars' && (
                    <Check className="w-3.5 h-3.5 text-cyan-400" />
                  )}
                </div>
                <p className="text-[10px] text-neutral-400 leading-snug">
                  El mismo contorno, muestreado más junto para seguir el pico de cada golpe.
                </p>
              </button>
            </div>
          </div>}

          {/* Color Schemes - DJ Deck Modes */}
          {family === 'analyzer' && <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-cyan-400" />
                Modos DJ Deck de Color
              </label>
              <span className="text-[10px] font-mono text-cyan-400/80">Estándar Pro RGB</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              {officialDeckModes.map((schemeId) => {
                const scheme = COLOR_SCHEMES[schemeId];
                const isSelected = config.colorScheme === schemeId;
                return (
                  <button
                    key={schemeId}
                    id={`btn-color-${schemeId}`}
                    onClick={() => onConfigChange((prev) => ({ ...prev, colorScheme: schemeId }))}
                    className={`flex flex-col p-2.5 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'bg-white/10 border-cyan-400 text-white shadow-lg shadow-cyan-950/40'
                        : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1.5">
                      <div className="flex items-center gap-2">
                        {/* 3-band mini indicator */}
                        <div className="flex gap-0.5">
                          <span className="w-2.5 h-3.5 rounded-sm" style={{ backgroundColor: scheme.lowBand }} title="Graves" />
                          <span className="w-2.5 h-3.5 rounded-sm" style={{ backgroundColor: scheme.midBand }} title="Medios" />
                          <span className="w-2.5 h-3.5 rounded-sm" style={{ backgroundColor: scheme.highBand }} title="Agudos" />
                        </div>
                        <span className="font-mono font-medium text-[12px]">{scheme.name}</span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                    </div>
                    {/* Micro gradient bar preview */}
                    <div 
                      className="w-full h-1.5 rounded-full mb-1 opacity-80"
                      style={{
                        background: `linear-gradient(to right, ${scheme.gradientSpectrum.map(([p, c]) => `${c} ${p * 100}%`).join(', ')})`
                      }}
                    />
                    <span className="text-[10px] text-neutral-400 line-clamp-1">{scheme.tagline}</span>
                  </button>
                );
              })}
            </div>

            {/* Additional studio palettes */}
            <label className="block text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-1.5">
              Estilos de Estudio Adicionales
            </label>
            <div className="grid grid-cols-2 gap-2">
              {additionalModes.map((schemeId) => {
                const scheme = COLOR_SCHEMES[schemeId];
                const isSelected = config.colorScheme === schemeId;
                return (
                  <button
                    key={schemeId}
                    onClick={() => onConfigChange((prev) => ({ ...prev, colorScheme: schemeId }))}
                    className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-white/10 border-cyan-400 text-white'
                        : 'bg-white/5 border-white/10 text-neutral-400 hover:text-neutral-200 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        <span className="w-2 h-3 rounded-sm" style={{ backgroundColor: scheme.lowBand }} />
                        <span className="w-2 h-3 rounded-sm" style={{ backgroundColor: scheme.midBand }} />
                        <span className="w-2 h-3 rounded-sm" style={{ backgroundColor: scheme.highBand }} />
                      </div>
                      <span className="font-mono text-[11px]">{scheme.name}</span>
                    </div>
                    {isSelected && <Check className="w-3 h-3 text-cyan-400" />}
                  </button>
                );
              })}
            </div>
          </div>}

          {/* Dimensions & Presets */}
          {family === 'analyzer' && <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
                Presets de Altura
              </label>
              <span className="font-mono text-[11px] text-cyan-300">
                Actual: {currentHeight} px (~{((currentHeight / 96) * 2.54).toFixed(1)} cm)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
              <button
                onClick={() => onHeightChange(80)}
                className={`py-1.5 px-2 rounded border transition-colors ${
                  currentHeight <= 90
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                    : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
                }`}
              >
                Compacto (80px)
              </button>
              <button
                onClick={() => onHeightChange(115)}
                className={`py-1.5 px-2 rounded border transition-colors ${
                  currentHeight > 90 && currentHeight <= 140
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                    : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
                }`}
              >
                ~3 cm (115px)
              </button>
              <button
                onClick={() => onHeightChange(240)}
                className={`py-1.5 px-2 rounded border transition-colors ${
                  currentHeight > 140
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                    : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
                }`}
              >
                Estudio (240px)
              </button>
            </div>
          </div>}

          {/* Peak Hold & BPM Tempo Detection Configuration */}
          {family === 'analyzer' && <div className="pt-3 border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
                Peak Hold & Detección de BPM
              </label>
              <span className="text-[10px] font-mono text-cyan-400/80">Tiempo Real</span>
            </div>

            {/* Peak Hold Toggle and Decay Speed */}
            <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 mb-2.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showPeakHold !== false}
                    onChange={(e) => onConfigChange((prev) => ({ ...prev, showPeakHold: e.target.checked }))}
                    className="accent-cyan-400"
                  />
                  <div>
                    <span className="font-mono text-xs text-neutral-200 block">Líneas de Peak Hold en Espectro</span>
                    <span className="text-[10px] text-neutral-400 block">
                      Pequeñas líneas horizontales en el pico de cada banda que decaen suavemente
                    </span>
                  </div>
                </label>
              </div>

              {/* Decay Speed selector (only when peak hold is active) */}
              {config.showPeakHold !== false && (
                <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-neutral-400">Velocidad de Decaimiento:</span>
                  <div className="flex gap-1.5 font-mono text-[10px]">
                    {(['slow', 'medium', 'fast'] as const).map((spd) => {
                      const labels = { slow: 'Lento (DJ)', medium: 'Normal', fast: 'Rápido' };
                      const isSelected = (config.peakHoldDecay || 'slow') === spd;
                      return (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => onConfigChange((prev) => ({ ...prev, peakHoldDecay: spd }))}
                          className={`px-2 py-0.5 rounded border transition-colors ${
                            isSelected
                              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                              : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
                          }`}
                        >
                          {labels[spd]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Center Beat Pulse Line & Point */}
            <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 mb-2.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showBeatCenterLine !== false}
                  onChange={(e) => onConfigChange((prev) => ({ ...prev, showBeatCenterLine: e.target.checked }))}
                  className="accent-cyan-400"
                />
                <div>
                  <span className="font-mono text-xs text-neutral-200 block">Línea & Punto Central de Pulso BPM</span>
                  <span className="text-[10px] text-neutral-400 block">
                    Línea en el medio con punto rítmico que late al tempo del track para detectar el beat
                  </span>
                </div>
              </label>
            </div>

            {/* Transparent Bottom-Right BPM Badge Overlay */}
            <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showBpmOverlay !== false}
                  onChange={(e) => onConfigChange((prev) => ({ ...prev, showBpmOverlay: e.target.checked }))}
                  className="accent-cyan-400"
                />
                <div>
                  <span className="font-mono text-xs text-neutral-200 block">Indicador BPM en Esquina Inferior Derecha</span>
                  <span className="text-[10px] text-neutral-400 block">
                    Muestra el BPM y LED de pulso en transparente abajo a la derecha sin molestar a la visualización
                  </span>
                </div>
              </label>
            </div>
          </div>}

          {/* Toggles */}
          {family === 'analyzer' && <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showStereometer}
                onChange={(e) => onConfigChange((prev) => ({ ...prev, showStereometer: e.target.checked }))}
                className="accent-cyan-400"
              />
              <span className="font-mono text-neutral-300">Medidor Estéreo L/R flotante</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showFrequencyGrid}
                onChange={(e) => onConfigChange((prev) => ({ ...prev, showFrequencyGrid: e.target.checked }))}
                className="accent-cyan-400"
              />
              <span className="font-mono text-neutral-300">Rejilla Hz / dB</span>
            </label>
          </div>}
        </div>

        {/* Footer info note */}
        <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-neutral-500">
          <span>Arrastra los bordes superior/inferior para redimensionar en vivo</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium transition-colors"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
