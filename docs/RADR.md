# Traktor en la visual

Metergroove sigue con los tres modos que ya tenía. El nombre del tema no es un cuarto motor: es una capa de texto encima de audio rítmico y generativo.

## Audio de la placa

El navegador no puede capturar una salida de audio a pelo. **Ver placas** pide permiso y lista las entradas que sí puede abrir: micrófono, line-in, Stereo Mix o el loopback que publica la interfaz donde suena Traktor. Al elegir una, el análisis usa ese `deviceId`.

Si la placa solo aparece como salida, no saldrá en la lista. En Windows hace falta Stereo Mix, el loopback del fabricante, o la fuente **Sistema**.

## Metadata

Traktor → Broadcasting → host `127.0.0.1`, puerto `39217` (o el valor de `TRAKTOR_PORT`), bitrate bajo.

`npm run dev` abre un listener TCP solo en localhost. Lee los comentarios Vorbis y publica `/traktor/now-playing` en el mismo servidor. La página lo consulta cada segundo. No hay servicio externo.

El cambio de tema actualiza la textura del texto y hace un fundido. No reinicia el visualizador ni el `AudioContext`.

## Texto

Formatos: artista y título, solo uno de los dos, y el orden invertido. La deformación (pulso, onda, glitch) usa grave, agudo y beat. La fusión (encima, screen, multiply, difference) es el modo de mezcla del canvas de texto sobre la visual.

Si Traktor no emite, la visual sigue. El ajuste muestra el estado.
