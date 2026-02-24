import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        play: resolve(__dirname, 'play.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5050',
      '/ws': {
        target: 'ws://localhost:5050',
        ws: true,
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
