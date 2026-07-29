import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Build variant for the standalone `.html` file.
 *
 * Browsers refuse to run `<script type="module">` from a `file://` URL, so this
 * emits one classic IIFE bundle instead. That is what lets the single file be
 * opened straight off a disk with no server and no install.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-single',
    assetsDir: '.',
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
});
