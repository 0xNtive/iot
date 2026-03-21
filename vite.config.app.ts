import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'app',
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/app'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'app/index.html'),
        landing: resolve(__dirname, 'app/landing.html'),
      },
    },
  },
  resolve: {
    alias: {
      'wavepx': resolve(__dirname, 'lib/index.ts'),
    },
  },
});
