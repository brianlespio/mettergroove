# 🎛️ DJ Deck Horizontal Audio Spectrum & Analysis Engine (Open Source)

> **Módulo de Análisis de Audio en Tiempo Real para Decks de DJ y Reproductores de Audio**  
> *Standalone, zero-dependency, ultra-fast real-time audio frequency decomposition and horizontal spectrum analysis engine.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6.svg)]()
[![Platform](https://img.shields.io/badge/Platform-WebAudio%20%7C%20Electron%20%7C%20AudioWorklet-success.svg)]()

---

## 📖 Descripción General

Este módulo open source proporciona el **motor de análisis de audio horizontal y espectro de frecuencias** diseñado específicamente para integrarse en software de DJ (decks virtuales, reproductores de audio en Electron, aplicaciones web o estaciones de trabajo de audio digital).

Separa con precisión el flujo de audio en tiempo real en:
1. **Espectro Horizontal Logarítmico (20 Hz - 20 kHz)**: Mapeo perceptual de frecuencias con interpolación spline Catmull-Rom para visualización líquida.
2. **Descomposición Tri-Banda (Low / Mid / High)**: Aislamiento energético de sub-graves/bombo, medios/voces y agudos/platos para colorear formas de onda RGB.
3. **Métricas Estereofónicas de Precisión**: Correlación de fase $[-1.0, +1.0]$ para compatibilidad mono, balance estéreo $L/R$, decodificación Mid/Side y ancho estéreo.
4. **Detector de Transientes y Golpes**: Identificación instantánea de transientes percusivos para beatmatching y marcadores de cue.
5. **Balística de Picos y Caída Gravitatoria**: Retención de picos (*Peak-Hold*) con física de caída natural.

---

## 🚀 Instalación y Uso Rápido

Copia la carpeta `opensource/` directamente en tu proyecto. Tiene **cero dependencias externas** (solo requiere la API nativa de Web Audio).

### 1. Conexión a un Deck de Audio o Reproductor

```typescript
import { HorizontalSpectrumAnalyzer } from './opensource';

// 1. Crear el AudioContext nativo
const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

// 2. Instanciar el analizador horizontal
const analyzer = new HorizontalSpectrumAnalyzer(audioContext, {
  fftSize: 2048,               // Resolución de frecuencia (1024, 2048, 4096)
  lowCrossoverHz: 250,         // Separador Graves / Medios (Hz)
  highCrossoverHz: 4000,       // Separador Medios / Agudos (Hz)
  horizontalPoints: 128,       // Puntos a lo largo de la barra horizontal
  smoothingTimeConstant: 0.65, // Suavizado de decaimiento
});

// 3. Conectar a cualquier elemento de audio (por ejemplo, Deck A)
const audioElement = document.getElementById('deck-a-audio') as HTMLAudioElement;
const deckSourceNode = audioContext.createMediaElementSource(audioElement);

// Conectar el nodo del deck al analizador y a los altavoces
analyzer.connect(deckSourceNode);
deckSourceNode.connect(audioContext.destination);
```

---

### 2. Bucle de Análisis en Tiempo Real (requestAnimationFrame)

```typescript
function renderDeckFrame() {
  requestAnimationFrame(renderDeckFrame);

  // Obtener los datos calculados para este fotograma
  const analysis = analyzer.analyze();

  // 1. Energía Tri-Banda para formas de onda estilo DJ RGB
  const { low, mid, high } = analysis.bands;
  console.log(`Graves: ${low.toFixed(2)}, Medios: ${mid.toFixed(2)}, Agudos: ${high.toFixed(2)}`);

  // 2. Métricas Estéreo y Fase
  const { correlation, balance, width } = analysis.stereo;
  if (correlation < 0) {
    console.warn('¡Aviso! Posible cancelación de fase en el deck.');
  }

  // 3. Puntos de la curva de espectro horizontal (20Hz a 20kHz)
  for (const point of analysis.spectrum) {
    // point.normalizedX: Posición X en la barra (0.0 a 1.0)
    // point.frequencyHz: Frecuencia exacta en Hertz
    // point.magnitude:   Magnitud suavizada (0.0 a 1.0)
    // point.db:          Nivel en decibelios (-60 dB a 0 dB)
    // point.peakHold:    Nivel de pico retenido con caída
  }

  // 4. Rodaja temporal para añadir a formas de onda con desplazamiento continuo
  const waveSlice = analysis.waveSlice;
  if (waveSlice.isTransient) {
    // Golpe o transiente detectado (p. ej. kick drum o snare)
  }
}

renderDeckFrame();
```

---

### 3. Renderizado Directo en Canvas (Opcional)

Si deseas dibujar la barra de espectro horizontal de inmediato en un elemento `<canvas>`:

```typescript
import { HorizontalSpectrumCanvas } from './opensource';

const canvas = document.getElementById('deck-spectrum-canvas') as HTMLCanvasElement;
const spectrumRenderer = new HorizontalSpectrumCanvas(canvas);

// Dentro de tu bucle de animación:
const analysis = analyzer.analyze();
spectrumRenderer.renderSpectrum(analysis, {
  backgroundColor: '#070a0f',
  strokeColor: '#00d2ff',
  glowColor: '#00d2ff',
  peakColor: '#facc15',
  showGrid: true,
  fillGradient: true,
});
```

---

## 📊 Estructura de Archivos

```
opensource/
├── index.ts                     # Punto de entrada y exportaciones públicas
├── types.ts                     # Definiciones TypeScript completas
├── HorizontalSpectrumAnalyzer.ts # Motor matemático de análisis en tiempo real
├── HorizontalSpectrumCanvas.ts   # Helper opcional para renderizado en Canvas 2D
└── README.md                    # Esta documentación
```

---

## 🔬 Especificaciones Técnicas

| Característica | Detalle |
| :--- | :--- |
| **Rango de Frecuencias** | $20\text{ Hz} - 20\,000\text{ Hz}$ mapeado logarítmicamente |
| **Separación de Bandas** | Graves ($20-250\text{ Hz}$), Medios ($250-4\,000\text{ Hz}$), Agudos ($4\,000-20\,000\text{ Hz}$) |
| **Escala Dinámica** | $-60\text{ dBFS}$ a $0\text{ dBFS}$ con normalización visual perceptual |
| **Correlación de Fase** | Cálculo de producto escalar normalizado $\frac{\sum L \cdot R}{\sqrt{\sum L^2 \cdot \sum R^2}}$ |
| **Rendimiento** | $< 0.8\text{ ms}$ por fotograma en CPU moderna, $0$ recolecciones de basura pesadas |
| **Dependencias** | **Ninguna**. 100% TypeScript puro compatible con cualquier framework |

---

## 📄 Licencia

Este software se publica bajo la **Licencia MIT**. Eres libre de utilizarlo, modificarlo, redistribuirlo e incorporarlo en cualquier software de DJ comercial o de código abierto sin restricciones.
