import net from 'node:net';
import { EMPTY_TRACK, TRAKTOR_PORT, type TraktorLinkState } from '../src/traktor/types';
import { VorbisCommentReader } from '../src/traktor/vorbisComments';

export interface TraktorBridge {
  snapshot(): TraktorLinkState;
  close(): void;
}

/**
 * Listens on localhost for Traktor's Icecast SOURCE broadcast and keeps the
 * latest Vorbis artist/title. Nothing is forwarded off the machine.
 */
function headerEnd(buffer: Buffer): { index: number; length: number } | null {
  const crlf = buffer.indexOf('\r\n\r\n');
  const lf = buffer.indexOf('\n\n');
  if (crlf < 0 && lf < 0) return null;
  if (crlf < 0 || (lf >= 0 && lf < crlf)) return { index: lf, length: 2 };
  return { index: crlf, length: 4 };
}

export function createTraktorBridge(port = Number(process.env.TRAKTOR_PORT) || TRAKTOR_PORT): TraktorBridge {
  const state: TraktorLinkState = {
    ...EMPTY_TRACK,
    listening: false,
    connected: false,
    port,
    error: '',
  };
  let sockets = 0;

  const server = net.createServer((socket) => {
    const remote = socket.remoteAddress ?? '';
    if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') {
      socket.destroy();
      return;
    }
    sockets += 1;
    state.connected = true;
    state.status = state.artist || state.title ? 'playing' : 'unknown';
    const reader = new VorbisCommentReader();
    let header = true;
    let pending = Buffer.alloc(0);

    const apply = (chunk: Buffer) => {
      const tags = reader.push(chunk);
      if (!tags) return;
      const changed = tags.artist !== state.artist || tags.title !== state.title;
      state.artist = tags.artist;
      state.title = tags.title;
      state.album = tags.album;
      state.status = 'playing';
      if (changed) state.timestamp = Date.now();
    };

    socket.on('data', (chunk) => {
      if (!header) {
        apply(chunk);
        return;
      }
      pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
      const end = headerEnd(pending);
      if (!end) {
        if (pending.length > 8192) socket.destroy();
        return;
      }
      header = false;
      socket.write('HTTP/1.0 200 OK\r\nServer: Mettergroove\r\n\r\n');
      const rest = pending.subarray(end.index + end.length);
      pending = Buffer.alloc(0);
      if (rest.length > 0) apply(rest);
    });

    const detach = () => {
      sockets = Math.max(0, sockets - 1);
      state.connected = sockets > 0;
      if (!state.connected) state.status = state.artist || state.title ? 'stopped' : 'unknown';
    };
    socket.on('close', detach);
    socket.on('error', detach);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    state.listening = false;
    state.error = error.code === 'EADDRINUSE'
      ? `El puerto ${port} ya está en uso. Elige otro en Traktor y en TRAKTOR_PORT.`
      : error.message;
  });

  server.listen(port, '127.0.0.1', () => {
    state.listening = true;
    state.error = '';
    state.port = port;
  });

  return {
    snapshot: () => ({ ...state }),
    close: () => server.close(),
  };
}
