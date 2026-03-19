import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'app',
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/app'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      'wavepx': resolve(__dirname, 'lib/index.ts'),
    },
  },
});
