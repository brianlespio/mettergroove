import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AudioEngine, AudioSourceType } from '../audio/AudioEngine';
import { AnalyzerEngine } from '../visualization/analyzers/AnalyzerEngine';
import { VisualizerConfig, VisualizerMode, ColorSchemeId } from '../types/audio';
import { COLOR_SCHEMES } from '../visual/colorSchemes';
import { 
  Activity,
  Volume2, 
  Layers, 
  Radio, 
  Sliders, 
  Maximize2, 
  Minimize2, 
  Palette,
  UnfoldVertical,
  Play,
  Square,
  Settings,
  GripHorizontal
} from 'lucide-react';

interface AudioVisualizerBarProps {
  engine: AudioEngine;
  initialHeight?: number; // default ~115px (~3 cm on 96 DPI)
  height: number;
  onHeightChange: (height: number) => void;
  width?: number | string;
  onWidthChange?: (width: number) => void;
  onOpenSettings: () => void;
  sourceType: AudioSourceType;
  onPlayDemo: () => void;
  onStopAudio: () => void;
  onToggleFullscreen?: () => void;
  fullscreen?: boolean;
  config: VisualizerConfig;
  setConfig: React.Dispatch<React.SetStateAction<VisualizerConfig>>;
  className?: string;
}

export const AudioVisualizerBar: React.FC<AudioVisualizerBarProps> = ({
  engine,
  height,
  onHeightChange,
  width,
  onWidthChange,
  onOpenSettings,
  sourceType,
  onPlayDemo,
  onStopAudio,
  onToggleFullscreen,
  fullscreen = false,
  config,
  setConfig,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyzerRef = useRef<AnalyzerEngine | null>(null);

  const [cursorX, setCursorX] = useState<number | null>(null);
  const [showControls, setShowControls] = useState(false);
  const [liveBpmState, setLiveBpmState] = useState({
    bpm: 0,
    confidence: 0,
    isBeat: false,
    beatPulse: 0,
    bpmStable: false,
  });
  const lastUiSyncRef = useRef<number>(0);

  // Resize drag states
  const [isResizingTop, setIsResizingTop] = useState<boolean>(false);
  const [isResizingBottom, setIsResizingBottom] = useState<boolean>(false);
  const [isResizingLeft, setIsResizingLeft] = useState<boolean>(false);
  const [isResizingRight, setIsResizingRight] = useState<boolean>(false);
  const [isResizingCorner, setIsResizingCorner] = useState<boolean>(false);

  // Sync internal height state
  const handleSetHeight = useCallback((newH: number) => {
    const clamped = Math.max(55, Math.min(window.innerHeight - 20, Math.round(newH)));
    onHeightChange(clamped);
    setConfig((prev) => ({ ...prev, height: clamped }));
  }, [onHeightChange, setConfig]);

  const handleSetWidth = useCallback((newW: number) => {
    if (!onWidthChange) return;
    const clamped = Math.max(280, Math.min(window.innerWidth - 10, Math.round(newW)));
    onWidthChange(clamped);
  }, [onWidthChange]);

  // Handle Canvas Resize and DPI adjustments
  const updateCanvasSize = useCallback(() => {
    if (!containerRef.current || !canvasRef.current || !analyzerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = height;
    analyzerRef.current.resize(w, h);
  }, [height]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const analyzer = new AnalyzerEngine(canvasRef.current);
    analyzerRef.current = analyzer;
    return () => {
      analyzer.dispose();
      if (analyzerRef.current === analyzer) analyzerRef.current = null;
    };
  }, []);

  useEffect(() => {
    updateCanvasSize();
    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [updateCanvasSize]);

  // Main 60 FPS requestAnimationFrame render loop
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const renderLoop = (time: number) => {
      const deltaSec = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;

      if (analyzerRef.current) {
        analyzerRef.current.setPointer(cursorX);
        const frameData = engine.getFrameData();
        analyzerRef.current.renderFrame(frameData, deltaSec, config, sourceType === 'demo');

        // Throttled UI state sync for bottom-right transparent badge (~10 fps update to keep React ultra fast)
        if (time - lastUiSyncRef.current > 100) {
          lastUiSyncRef.current = time;
          const bState = analyzerRef.current.bpmState;
          setLiveBpmState({
            bpm: bState.bpm,
            confidence: bState.confidence,
            isBeat: bState.isBeat,
            beatPulse: bState.beatPulse,
            bpmStable: bState.bpmStable,
          });
        }
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [engine, config, cursorX]);

  // Comprehensive Edge & Corner Resizing Interactions
  useEffect(() => {
    const isDragging = isResizingTop || isResizingBottom || isResizingLeft || isResizingRight || isResizingCorner;
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      if (isResizingBottom) {
        handleSetHeight(e.clientY - rect.top);
      } else if (isResizingTop) {
        handleSetHeight(rect.bottom - e.clientY);
      }

      if (isResizingRight) {
        handleSetWidth(e.clientX - rect.left);
      } else if (isResizingLeft) {
        handleSetWidth(rect.right - e.clientX);
      }

      if (isResizingCorner) {
        handleSetHeight(e.clientY - rect.top);
        handleSetWidth(e.clientX - rect.left);
      }
    };

    const onMouseUp = () => {
      setIsResizingTop(false);
      setIsResizingBottom(false);
      setIsResizingLeft(false);
      setIsResizingRight(false);
      setIsResizingCorner(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizingTop, isResizingBottom, isResizingLeft, isResizingRight, isResizingCorner, handleSetHeight, handleSetWidth]);

  // Canvas Mouse Interactions (Hover Frequency Inspector)
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCursorX(e.clientX - rect.left);
  };

  const handleCanvasMouseLeave = () => {
    setCursorX(null);
  };

  const cycleMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    const modes: VisualizerMode[] = ['combined', 'waveform', 'spectrum', 'stereo', 'levels'];
    const nextIdx = (modes.indexOf(config.mode) + 1) % modes.length;
    setConfig((prev) => ({ ...prev, mode: modes[nextIdx] }));
  };

  const cycleColorScheme = (e: React.MouseEvent) => {
    e.stopPropagation();
    const schemes: ColorSchemeId[] = ['spectrum', 'infrared', 'x-ray', 'ultraviolet'];
    const currentIdx = schemes.indexOf(config.colorScheme as any);
    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % schemes.length : 0;
    setConfig((prev) => ({ ...prev, colorScheme: schemes[nextIdx] }));
  };

  const currentColor = COLOR_SCHEMES[config.colorScheme] || COLOR_SCHEMES.spectrum;
  const isAnyResizing = isResizingTop || isResizingBottom || isResizingLeft || isResizingRight || isResizingCorner;

  return (
    <div
      ref={containerRef}
      id="audio-visualizer-bar-container"
      className={`relative select-none group rounded-md transition-shadow duration-150 ${className}`}
      style={{
        height: `${height}px`,
        width: typeof width === 'number' ? `${width}px` : (width || '100%'),
        boxShadow: '0 8px 32px -4px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.1)',
        backgroundColor: currentColor.background,
      }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => {
        setShowControls(false);
        setCursorX(null);
      }}
    >
      {/* Top Resize Handle */}
      <div
        id="handle-top-edge"
        className="absolute -top-2 left-3 right-3 h-4 cursor-ns-resize z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizingTop(true);
        }}
        title="Arrastra para cambiar altura"
      >
        <div className="w-16 h-1 bg-cyan-400/50 hover:bg-cyan-300 rounded-full" />
      </div>

      {/* Bottom Resize Handle */}
      <div
        id="handle-bottom-edge"
        className="absolute -bottom-2 left-3 right-3 h-4 cursor-ns-resize z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizingBottom(true);
        }}
        title="Arrastra para cambiar altura"
      >
        <div className="w-16 h-1 bg-cyan-400/50 hover:bg-cyan-300 rounded-full flex items-center justify-center">
          <GripHorizontal className="w-3 h-3 text-cyan-200" />
        </div>
      </div>

      {/* Left Resize Handle */}
      <div
        id="handle-left-edge"
        className="absolute top-2 bottom-2 -left-2 w-4 cursor-ew-resize z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizingLeft(true);
        }}
        title="Arrastra para cambiar ancho"
      >
        <div className="h-10 w-1 bg-cyan-400/50 hover:bg-cyan-300 rounded-full" />
      </div>

      {/* Right Resize Handle */}
      <div
        id="handle-right-edge"
        className="absolute top-2 bottom-2 -right-2 w-4 cursor-ew-resize z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizingRight(true);
        }}
        title="Arrastra para cambiar ancho"
      >
        <div className="h-10 w-1 bg-cyan-400/50 hover:bg-cyan-300 rounded-full" />
      </div>

      {/* Bottom-Right Corner Resize Handle */}
      <div
        id="handle-bottom-right-corner"
        className="absolute -bottom-2 -right-2 w-5 h-5 cursor-nwse-resize z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizingCorner(true);
        }}
        title="Arrastra esquina para redimensionar libremente"
      >
        <div className="w-2.5 h-2.5 bg-cyan-400/70 rounded-br-sm border-r-2 border-b-2 border-white" />
      </div>

      {/* Main High-DPI Canvas */}
      <canvas
        ref={canvasRef}
        id="audio-visualizer-canvas"
        className="w-full h-full block rounded-md cursor-crosshair"
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={handleCanvasMouseLeave}
        onClick={() => {
          if (sourceType === 'none') {
            onPlayDemo();
          }
        }}
      />

      {/* Subtle overlay hint when idle */}
      {sourceType === 'none' && !showControls && (
        <div 
          onClick={onPlayDemo}
          className="absolute inset-0 flex items-center justify-center pointer-events-auto cursor-pointer"
        >
          <div className="px-3 py-1.5 rounded-full bg-black/60 border border-white/10 text-neutral-300 text-xs font-mono backdrop-blur-sm hover:border-cyan-400/50 hover:text-white transition-all flex items-center gap-2 shadow-lg">
            <Play className="w-3.5 h-3.5 text-cyan-400 fill-current animate-pulse" />
            <span>Haz clic para reproducir demo estéreo</span>
          </div>
        </div>
      )}

      {/* Floating Minimal Control Bar (appears on hover) */}
      <div
        id="visualizer-floating-toolbar"
        className={`absolute top-2 right-2 flex items-center gap-1 px-1.5 py-1 rounded-md bg-neutral-950 border border-cyan-400/50 shadow-xl transition-opacity duration-150 z-20 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Play/Stop Quick Toggle */}
        {sourceType === 'none' ? (
          <button
            id="bar-btn-play"
            onClick={(e) => {
              e.stopPropagation();
              onPlayDemo();
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs font-mono font-medium text-cyan-300 hover:text-white bg-cyan-500/20 hover:bg-cyan-500/30 rounded border border-cyan-500/40 transition-colors"
            title="Reproducir Groove Demo"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Play</span>
          </button>
        ) : (
          <button
            id="bar-btn-stop"
            onClick={(e) => {
              e.stopPropagation();
              onStopAudio();
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs font-mono font-medium text-red-300 hover:text-white bg-red-500/20 hover:bg-red-500/30 rounded border border-red-500/40 transition-colors"
            title="Detener Audio"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Stop</span>
          </button>
        )}

        {/* Mode Selector Toggle */}
        <button
          id="bar-btn-mode"
          onClick={cycleMode}
          className="flex items-center gap-1 px-2 py-1 text-xs font-mono text-neutral-200 hover:text-white bg-white/5 hover:bg-white/10 rounded transition-colors"
          title={`Modo: ${config.mode === 'combined' ? 'TODOS' : config.mode === 'levels' ? 'dB' : config.mode.toUpperCase()} (Click para alternar)`}
        >
          {config.mode === 'combined' && <Layers className="w-3 h-3 text-cyan-400" />}
          {config.mode === 'waveform' && <Activity className="w-3 h-3 text-emerald-400" />}
          {config.mode === 'spectrum' && <Sliders className="w-3 h-3 text-amber-400" />}
          {config.mode === 'stereo' && <Radio className="w-3 h-3 text-fuchsia-400" />}
          {config.mode === 'levels' && <Volume2 className="w-3 h-3 text-emerald-300" />}
          <span className="capitalize hidden sm:inline">{config.mode === 'combined' ? 'Todos' : config.mode === 'levels' ? 'dB' : config.mode}</span>
        </button>

        {/* Color Scheme Picker */}
        <button
          id="bar-btn-color"
          onClick={cycleColorScheme}
          className="flex items-center justify-center min-w-8 min-h-8 p-1.5 text-cyan-100 bg-white/10 hover:bg-cyan-500/30 rounded border border-white/30 transition-colors"
          title={`Color: ${currentColor.name}`}
        >
          <Palette className="w-3.5 h-3.5" />
        </button>

        {/* Preset Heights: Compact (~3cm/115px) vs Expanded */}
        <button
          id="bar-btn-preset-toggle"
          onClick={(e) => {
            e.stopPropagation();
            handleSetHeight(height <= 130 ? 220 : 115);
          }}
          className="flex items-center justify-center min-w-8 min-h-8 p-1.5 text-cyan-100 bg-white/10 hover:bg-cyan-500/30 rounded border border-white/30 transition-colors"
          title={height <= 130 ? 'Expandir vista vertical' : 'Vista compacta (~3 cm)'}
        >
          <UnfoldVertical className="w-3.5 h-3.5" />
        </button>

        {onToggleFullscreen && (
          <button
            id="bar-btn-fullscreen"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFullscreen();
            }}
            className="flex items-center justify-center min-w-8 min-h-8 p-1.5 text-cyan-100 bg-white/10 hover:bg-cyan-500/30 rounded border border-white/30 transition-colors"
            title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5 text-cyan-400" /> : <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />}
          </button>
        )}

        {/* Open Settings Modal Button */}
        <button
          id="bar-btn-open-settings"
          onClick={(e) => {
            e.stopPropagation();
            onOpenSettings();
          }}
          className="flex items-center gap-1 px-2 py-1 text-xs font-mono text-cyan-100 hover:text-white bg-cyan-500/25 hover:bg-cyan-500/40 rounded border border-cyan-300/60 transition-colors"
          title="Abrir Configuración de Audio y Visualizador"
        >
          <Settings className="w-3.5 h-3.5 text-cyan-200" />
          <span>Ajustes</span>
        </button>
      </div>

      {/* Transparent Bottom-Right BPM & Beat Sync Badge ("sin molestar a nada en transparente") */}
      {config.showBpmOverlay !== false && !isAnyResizing && (
        <div
          id="visualizer-bpm-overlay"
          className="absolute bottom-2 right-2 flex items-center gap-2 px-2 py-0.5 rounded bg-black/20 hover:bg-black/50 backdrop-blur-[2px] border border-white/10 text-neutral-300 text-[11px] font-mono select-none pointer-events-auto transition-all duration-150 z-20"
          title="Detector de Tempo BPM en vivo (Configurable en Ajustes)"
        >
          {/* Pulsing Beat LED */}
          <div className="relative flex items-center justify-center w-2 h-2">
            <span
              className={`absolute w-full h-full rounded-full transition-transform duration-75 ${
                liveBpmState.beatPulse > 0.08
                  ? 'bg-emerald-400 scale-125 opacity-95 shadow-[0_0_6px_#34d399]'
                  : 'bg-neutral-500 scale-90 opacity-40'
              }`}
            />
          </div>

          {/* Live BPM readout */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-neutral-400 uppercase tracking-wider">
              {liveBpmState.bpmStable ? 'BPM' : 'TEMPO'}
            </span>
            <span className="font-semibold text-white tracking-wide">
              {liveBpmState.bpm > 0 ? liveBpmState.bpm.toFixed(1) : '--.-'}
            </span>
          </div>

          {/* Subtle Peak Hold status chip */}
          {config.showPeakHold !== false && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-white/5 border border-white/10 text-neutral-400">
              PK
            </span>
          )}
        </div>
      )}

      {/* Real-time dimension tag when resizing */}
      {isAnyResizing && (
        <div
          id="visualizer-resizing-badge"
          className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/85 text-[11px] font-mono text-cyan-300 border border-cyan-400/50 pointer-events-none shadow-md"
        >
          {height}px (~{((height / 96) * 2.54).toFixed(1)} cm)
        </div>
      )}
    </div>
  );
};
