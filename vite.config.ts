import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  // Vercel сам отдаст статику из dist, root не трогаем
  build: {
    outDir: 'dist',
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  }
});
