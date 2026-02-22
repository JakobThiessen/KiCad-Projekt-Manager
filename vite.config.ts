import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Plugin to copy WASM files from occt-import-js to the build output
function copyOcctWasm(): Plugin {
  return {
    name: 'copy-occt-wasm',
    closeBundle() {
      const assetsDir = path.resolve(__dirname, 'dist/renderer/assets');
      const wasmSrc = path.resolve(__dirname, 'node_modules/occt-import-js/dist/occt-import-js.wasm');
      const wasmDest = path.join(assetsDir, 'occt-import-js.wasm');
      if (fs.existsSync(wasmSrc) && fs.existsSync(assetsDir)) {
        fs.copyFileSync(wasmSrc, wasmDest);
        console.log('Copied occt-import-js.wasm to dist/renderer/assets/');
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyOcctWasm()],
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      // Prevent bundling Node.js built-ins that appear in dead-code paths
      // of browser-compatible libraries (e.g. @tracespace/core's read() fn)
      external: (id) => id.startsWith('node:'),
    },
  },
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
