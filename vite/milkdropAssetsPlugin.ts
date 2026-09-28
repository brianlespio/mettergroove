import fs from 'node:fs';
import path from 'node:path';
import type { Connect, Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MilkdropCatalog, PresetRecord } from '../src/presets/types';

const PRESET_ROOT = path.resolve(process.cwd(), 'presetscream');
const TEXTURE_ROOT = path.resolve(process.cwd(), 'milkdroptexturepack');

let manifestCache: string | null = null;

export function milkdropAssetsPlugin(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use((request, response, next) => {
      const url = request.url?.split('?')[0] ?? '';
      if (url === '/milkdrop/manifest.json') {
        sendJson(response, buildManifest());
        return;
      }
      if (url.startsWith('/milkdrop/presets/')) {
        sendFile(response, safeFile(PRESET_ROOT, url.slice('/milkdrop/presets/'.length)), 'text/plain; charset=utf-8', next);
        return;
      }
      if (url.startsWith('/milkdrop/textures/')) {
        const relative = url.slice('/milkdrop/textures/'.length);
        sendFile(response, safeFile(TEXTURE_ROOT, relative), contentType(relative), next);
        return;
      }
      next();
    });
  };

  return {
    name: 'milkdrop-assets',
    configureServer(server: ViteDevServer) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
    closeBundle() {
      const outDir = path.resolve(process.cwd(), 'dist', 'milkdrop');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'manifest.json'), buildManifest());
      fs.cpSync(PRESET_ROOT, path.join(outDir, 'presets'), { recursive: true });
      if (fs.existsSync(TEXTURE_ROOT)) {
        fs.cpSync(TEXTURE_ROOT, path.join(outDir, 'textures'), { recursive: true });
      }
    },
  };
}

function buildManifest(): string {
  if (manifestCache) return manifestCache;
  const original: PresetRecord[] = [];
  if (fs.existsSync(PRESET_ROOT)) collectMilk(PRESET_ROOT, PRESET_ROOT, 'original', original);
  original.sort((a, b) => (a.path ?? '').localeCompare(b.path ?? ''));
  const catalog: MilkdropCatalog = {
    version: 1,
    collections: { original, community: [] },
  };
  manifestCache = JSON.stringify(catalog);
  return manifestCache;
}

function collectMilk(directory: string, root: string, source: 'original' | 'community', out: PresetRecord[]): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectMilk(full, root, source, out);
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.milk')) continue;
    const relative = path.relative(root, full).split(path.sep).join('/');
    out.push({
      id: `${source}:${relative}`,
      name: entry.name.replace(/\.milk$/i, ''),
      type: 'milkdrop',
      source,
      path: relative,
      collection: source,
    });
  }
}

function safeFile(root: string, encodedRelative: string): string | null {
  let relative = encodedRelative;
  try {
    relative = decodeURIComponent(encodedRelative);
  } catch {
    return null;
  }
  if (!relative || relative.includes('\0')) return null;
  const full = path.resolve(root, relative);
  const comparisonRoot = root.endsWith(path.sep) ? root : root + path.sep;
  if (full !== root && !full.startsWith(comparisonRoot)) return null;
  return full;
}

function sendJson(response: ServerResponse, body: string): void {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(body);
}

function sendFile(
  response: ServerResponse,
  file: string | null,
  type: string,
  next: Connect.NextFunction
): void {
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    next();
    return;
  }
  response.statusCode = 200;
  response.setHeader('Content-Type', type);
  fs.createReadStream(file).pipe(response);
}

function contentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

export function _resetManifestCacheForTests(): void {
  manifestCache = null;
}
