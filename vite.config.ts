import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // Vercel exposes GOOGLE_API_KEY in the build environment. 
  // We need to map it so our app can use it if needed (though Proxy is preferred).
  const apiKey = env.API_KEY || env.GOOGLE_API_KEY || '';

  return {
    plugins: [react()],
    define: {
      // Define global constants to replace in the code
      'process.env.API_KEY': JSON.stringify(apiKey),
      // We define process.env as an object to prevent crashes in some libraries
      'process.env': {} 
    },
    build: {
      outDir: 'dist',
      target: 'esnext'
    }
  };
});