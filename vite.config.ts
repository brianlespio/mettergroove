import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { milkdropAssetsPlugin } from './vite/milkdropAssetsPlugin';
import { traktorBridgePlugin } from './vite/traktorBridgePlugin';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), milkdropAssetsPlugin(), traktorBridgePlugin()],
    optimizeDeps: {
      include: ['butterchurn', 'milkdrop-preset-converter'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: [
          '**/presetscream/**',
          '**/motor/**',
          '**/codigofuente/**',
          '**/expressionevaluator/**',
          '**/rust/**',
          '**/audiorendering/**',
          '**/milkdroptexturepack/**',
        ],
      },
    },
  };
});
