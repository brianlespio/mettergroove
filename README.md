# Mettergroove

Visualizador audiovisual. Los analizadores de forma de onda, espectro y estéreo siguen siendo la vista por defecto. Desde ajustes se cambia a presets MilkDrop o a un generador matemático, sin reiniciar la captura de audio.

## Requisitos

- Node.js 20.19 o superior (Vite 8 no arranca en versiones anteriores)
- Un navegador con WebGL2 y Web Audio (Chrome o Edge actuales)

En esta máquina el binding nativo de Rolldown no se instala solo si Node es anterior a 20.19. Actualiza Node antes de `npm install`.

## Instalación

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

```bash
npm test
npm run lint
npm run build
npm run preview
```

No hace falta clave de API para el visualizador. El archivo `.env.example` pertenece a una integración previa y no interviene en el audio ni en los presets.

## Uso

1. Abre la configuración.
2. En **Visualization** elige Analizadores, Audio rítmico o Generativo.
3. Elige la fuente de audio: demo, micrófono, archivo, pestaña, sistema o ninguna.
4. La captura de pestaña o sistema la pide el navegador. Si el diálogo no incluye audio, esa fuente no suena: no es un fallo del visualizador.
5. En audio rítmico, busca un preset y usa anterior, siguiente o aleatorio.
6. En generativo, **Generate** crea una configuración con seed. **Save** guarda esa configuración en My Presets, no una captura.
7. Pantalla completa usa la Fullscreen API. Esc sale. El audio sigue.
8. En **De dónde tomar el audio**, **Ver placas** lista las entradas reales (micrófono, line-in, Stereo Mix o el loopback de la placa). Elige una para analizar ese audio.
9. En **Traktor Pro 4**: engranaje → Preferences → Broadcasting → **Server Settings**. Address `127.0.0.1`, Port `39217`, Format Ogg Vorbis al bitrate más bajo. Proxy se deja vacío. En Preferences → Global Settings marca **Show Global Section** y en **Right** elige **AUDIO RECORDER**. El botón de emisión está dentro de ese panel, en la franja superior de la ventana, no en Global Settings. En pantalla solo se muestra el nombre del tema.

El puente de Traktor arranca con `npm run dev` y con `npm run preview`. Solo escucha en localhost. La metadata no se envía fuera del equipo.

Los presets `.milk` se leen desde `presetscream/` y no se modifican. El índice es `/milkdrop/manifest.json`.

## Documentación de arquitectura

- [VISUALIZATION_ARCHITECTURE.md](VISUALIZATION_ARCHITECTURE.md)
- [docs/RADR.md](docs/RADR.md)
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
