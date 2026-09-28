# Third-party notices

El motor, los presets, las texturas y el contenido generado por el usuario no comparten licencia. Incluir el código de un motor no concede derechos sobre los presets ni sobre las texturas.

## Aplicación

El visualizador propio (analizadores, bus de audio, motor generativo, interfaz) es parte de este proyecto.

## Butterchurn

- Proyecto: https://github.com/jberg/butterchurn
- Versión usada: 2.6.7
- Licencia: MIT
- Papel: backend WebGL2 que ejecuta presets MilkDrop ya convertidos a su formato.
- No es libprojectM. No sustituye la licencia de los archivos `.milk`.

## milkdrop-preset-converter

- Proyecto: https://github.com/jberg/milkdrop-preset-converter
- Versión usada: 0.1.2
- Licencia: MIT
- Papel: traduce en memoria un `.milk` (ecuaciones y shaders HLSL) al objeto que Butterchurn puede compilar. El archivo de origen no se modifica ni se relicencia.

Dependencias que arrastra el conversor, entre otras: `hlslparser-js`, `milkdrop-eel-parser`, `milkdrop-preset-utils`. Conservan las licencias de sus propios paquetes.

## libprojectM

- Código presente en `motor/projectm-4.1.7` y `codigofuente/projectm-master`
- Licencia: GNU Lesser General Public License 2.1 (`motor/projectm-4.1.7/LICENSE.txt`)
- Esta build web no compila ni enlaza libprojectM. El fuente se conserva para un backend Emscripten posterior.
- La LGPL del motor no se extiende a los presets ni a las texturas.

Evaluador de expresiones en `expressionevaluator/projectm-eval-master`: ver su `LICENSE.md`. No entra en el bundle web.

## Presets MilkDrop

- Directorio: `presetscream/`
- Origen: Milkdrop “Cream of the Crop”, empaquetado como presets por el proyecto projectM.
- Texto de su `LICENSE.md`: en casi todos los casos los presets no se publicaron con una licencia concreta; cada autor conserva el copyright. El repositorio de projectM los trata como material publicado libremente y retira presets si el autor lo pide.
- Este proyecto no afirma que esos presets sean dominio público ni que la MIT de Butterchurn o la LGPL de projectM los cubran.
- No se han modificado.

## Texturas

- Directorio: `milkdroptexturepack/`
- El README describe el pack histórico de texturas de MilkDrop.
- En este checkout no hay archivos de imagen, solo el README. No se redistribuye un pack de texturas que no está presente.

## traktor_nowplaying

- Proyecto: https://github.com/radusuciu/traktor_nowplaying
- Licencia: MIT
- Papel: referencia del protocolo local de Traktor. Traktor emite un `SOURCE` Icecast y, dentro del Ogg/Vorbis, los comentarios `ARTIST` y `TITLE`.
- Este proyecto no ejecuta ese paquete de Python dentro del navegador. `bridge/traktorBridge.ts` escucha el mismo protocolo en `127.0.0.1` y se queda con la metadata. El audio de la emisión no se reenvía.
- El parser de comentarios Vorbis sigue la especificación de Xiph. No copia el código de tinytag ni el de traktor_nowplaying.

## Contenido generado por el usuario

Los presets creados con Generate y guardados con Save son configuración matemática producida en el navegador (seed, parámetros, mapeos). No son presets MilkDrop y no se escriben dentro de `presetscream/`.
