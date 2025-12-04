import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'), // у тебя всё лежит в корне
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext', // не трогаем современный синтаксис
  },
  esbuild: {
    supported: {
      // говорим esbuild: "top-level await" поддерживается окружением — не ломай его
      'top-level-await': true,
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
});
