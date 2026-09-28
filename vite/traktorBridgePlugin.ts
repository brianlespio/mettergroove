import type { Connect, Plugin, ViteDevServer } from 'vite';
import type { ServerResponse } from 'node:http';
import { createTraktorBridge, type TraktorBridge } from '../bridge/traktorBridge';

const SLOT = '__mettergrooveTraktorBridge';

type BridgeHolder = typeof globalThis & { [SLOT]?: TraktorBridge };

function currentBridge(): TraktorBridge {
  const holder = globalThis as BridgeHolder;
  if (!holder[SLOT]) holder[SLOT] = createTraktorBridge();
  return holder[SLOT];
}

function releaseWhenServerCloses(server: ViteDevServer, bridge: TraktorBridge): void {
  server.httpServer?.once('close', () => {
    bridge.close();
    delete (globalThis as BridgeHolder)[SLOT];
  });
}

function sendJson(response: ServerResponse, body: unknown): void {
  const payload = JSON.stringify(body);
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(payload);
}

function attach(middlewares: Connect.Server, bridge: TraktorBridge): void {
  middlewares.use((request, response, next) => {
    const url = request.url?.split('?')[0] ?? '';
    if (url !== '/traktor/now-playing' && url !== '/traktor/status') {
      next();
      return;
    }
    sendJson(response, bridge.snapshot());
  });
}

/** Local-only Traktor metadata endpoint. It does not leave the machine. */
export function traktorBridgePlugin(): Plugin {
  return {
    name: 'traktor-bridge',
    configureServer(server) {
      const bridge = currentBridge();
      releaseWhenServerCloses(server, bridge);
      attach(server.middlewares, bridge);
    },
    configurePreviewServer(server) {
      const bridge = currentBridge();
      releaseWhenServerCloses(server, bridge);
      attach(server.middlewares, bridge);
    },
  };
}
