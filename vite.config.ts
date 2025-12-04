import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // By default, Vite doesn't define `process.env`. We need to polyfill it.
      // We map GOOGLE_API_KEY (from Vercel) or API_KEY to process.env.API_KEY
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.GOOGLE_API_KEY || ''),
      // Prevent "process is not defined" error in libraries
      'process.env': {} 
    },
    build: {
      outDir: 'dist',
      target: 'esnext'
    }
  };
});