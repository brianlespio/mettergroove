# Arquitectura de visualización

## Arquitectura

La aplicación sigue siendo la app Vite/React existente. El cambio añade un límite entre el audio, el modo activo y el motor que ocupa el canvas.

```text
AudioEngine
    │  un solo AudioContext
    ▼
AudioAnalysisBus
    │  AudioAnalysisData
    ▼
VisualizationEngine
    ├── AnalyzerEngine        analizadores actuales (canvas 2D)
    ├── MilkDropEngine        presets .milk
    └── GenerativeEngine      generación matemática (WebGL2)
```

Solo un motor de imagen está montado. Cambiar de modo desmonta el anterior y conserva el `AudioContext`.

El estado visible vive en `App`: familia, analizador, preset MilkDrop, preset generado, fuente de audio y pantalla completa. Se guarda en `localStorage` (`mettergroove.visualization.v1`). Los presets del usuario van en otra clave (`mettergroove.userPresets.v1`) para poder pasarlos después a IndexedDB sin mezclarlos con las preferencias.

## Motores

`VisualizationEngine` exige `resize`, `render` y `dispose`.

- **AnalyzerEngine** envuelve `VisualizerRenderer` y `VisualState`. El dibujo de forma de onda, espectro, estéreo, color y BPM del analizador no se ha sustituido.
- **MilkDropEngine** carga texto `.milk`, lo convierte en memoria y lo entrega a Butterchurn. La UI no llama a Butterchurn.
- **GenerativeEngine** compila una vez los programas WebGL2 de campo vectorial, interferencia, espiral, fractal de Julia, anillo de forma de onda y caleidoscopio con feedback. El audio solo actualiza uniforms.

## Audio

`AudioEngine` sigue creando el contexto, el splitter estéreo y los dos `AnalyserNode`. Todas las fuentes también entran a un `GainNode` de escucha que no va a los altavoces. MilkDrop se conecta ahí, así que oye la misma señal que los analizadores y el volumen maestro no la atenúa.

Fuentes:

| Fuente | API | Sale por altavoces |
| --- | --- | --- |
| Demo | sintetizador ya existente | sí |
| Micrófono | `getUserMedia` | no |
| Archivo | `HTMLAudioElement` y, si falla, el buffer decodificado anterior | sí |
| Pestaña / sistema | `getDisplayMedia` | sí, porque el navegador entrega la pista capturada |
| Ninguna | detiene la fuente actual | — |

`AudioAnalysisBus` no crea otro contexto ni otro `AnalyserNode`. Parte del frame que ya calcula `AudioEngine` y publica `AudioAnalysisData`: forma de onda, FFT, graves, low-mid, medios, high-mid, agudos, RMS, amplitud, beat, fuerza de beat y BPM. Las bandas quedan en 0..1.

`AudioAnalysisAdapter` convierte ese snapshot a `bass`, `mid`, `treb`, `bass_att`, `mid_att`, `treb_att` y un PCM de 576 muestras. Es el contrato de projectM. El backend web actual, Butterchurn, calcula sus propias variables MilkDrop desde el nodo de audio porque el lenguaje de los presets lee esos valores dentro del motor. El adaptador queda para un backend WASM y para las pruebas. No se reescriben los presets para compensar la diferencia.

## Presets

`PresetManager` separa colecciones:

- **MilkDrop Original**: `presetscream/` (Cream of the Crop, 9795 archivos `.milk`)
- **MilkDrop Community**: vacía en este repositorio
- **Generated** y **My Presets**: la misma biblioteca de usuario, filtrada como vistas
- **Favoritos**: ids, no posiciones

El manifiesto solo guarda id, nombre, tipo, origen y ruta. El `.milk` se descarga al elegirlo. La lista virtualiza las filas. Las texturas se piden solo si el shader convertido nombra un `sampler_` que no es interno. Un preset que no convierte o no compila se registra, se escribe en consola y se salta hasta un máximo de ocho por secuencia. La aplicación sigue.

Guardar un generativo persiste seed, algoritmo, parámetros, mapeo de audio, color, movimiento, geometría, versión y fechas. No guarda un fotograma. El campo `thumbnail` existe en el registro y no se rellena al arrancar.

## Render

Los analizadores siguen en canvas 2D con `devicePixelRatio`.

MilkDrop y el generador usan WebGL2. El generador limita el ratio a 2, mantiene la proporción del buffer respecto al CSS y corrige el aspecto dentro del shader para que un círculo no se estire. MilkDrop rellena el canvas: su viewport es el tamaño CSS y `pixelRatio` escala las texturas internas, que es como está construido Butterchurn. Cambiar el tamaño del canvas no recrea el `AudioContext`.

En desarrollo, la esquina superior muestra FPS, tiempo de frame, tiempo de audio y el renderer. En producción ese bloque no se monta.

## Integración MilkDrop

`motor/projectm-4.1.7` incluye libprojectM 4.1.7 y documenta Emscripten. No hay `emcc` en este entorno y Node es anterior al que exige el toolchain de Vite, así que esta versión no enlaza el binario WASM de libprojectM.

El backend del navegador es:

```text
.milk original
    → milkdrop-preset-converter (HLSL → GLSL, ecuaciones EEL)
    → Butterchurn WebGL2
```

La conversión ocurre en memoria. El archivo original no se escribe. Si el conversor o `loadPreset` lanzan, el preset se marca incompatible en la sesión y se carga el siguiente. No se editan los `.milk` para “hacerlos funcionar”.

Un `INVALID_OPERATION` suelto no descarta el preset. Butterchurn lo genera en presets que sí dibujan, cuando un programa secundario no enlaza y el warp o el composite siguen en ejecución. No se consulta `gl.getError()` en cada frame: esa llamada sincroniza la GPU y, en este motor, no distingue un preset roto de uno que ya está en pantalla.

Un backend `ProjectMWasm` puede sustituir a Butterchurn detrás de `MilkDropEngine` sin tocar la UI. La frontera ya es `loadPreset`, `loadPresetData`, `render`, `resize`, `setAudioData` y `dispose`.

## Almacenamiento

Preferencias simples: `localStorage`. Presets generados: JSON versionado en `localStorage`, detrás de `PresetStore`. No hay backend.

## Extensión

Un motor nuevo implementa `VisualizationEngine`, se añade a `VisualizationFamily` y se monta desde `App` en lugar del canvas anterior. No hace falta otro contexto de audio.

## Limitaciones conocidas

- Compatibilidad MilkDrop real en el navegador significa el subconjunto que Butterchurn ejecuta después de convertir HLSL a GLSL. No es el binario de libprojectM ni un plugin de Winamp. Parte de los presets de Cream of the Crop enlazan un shader secundario mal y escriben errores WebGL en la consola; la imagen se mantiene si el warp o el composite sí enlazaron. Los que fallan al convertir se saltan.
- El preset inicial omite los de la carpeta de transiciones. Siguen disponibles en la lista y en anterior/siguiente.
- `milkdroptexturepack/` no contiene imágenes en este checkout, solo el README. Los `sampler_` externos no encuentran archivo y Butterchurn usa su textura de reserva.
- No hay pack de comunidad.
- La captura de sistema o de pestaña depende de que el navegador ofrezca una pista de audio en `getDisplayMedia`. No se simula si el permiso no llega.
- La pantalla completa no puede reabrirse sola al recargar: el navegador exige un gesto. La preferencia sí se guarda.
- Butterchurn no expone un destructor de shaders por preset. Al salir del modo se suelta el canvas. El cambio de preset reutiliza el mismo visualizador.
- El viewport de pantalla de Butterchurn está en píxeles CSS. La nitidez extra va en las texturas internas, con ratio limitado a 2.
- El build de producción copia `presetscream/` a `dist/milkdrop/presets` (unos 116 MB). No entra en el bundle de JavaScript.
