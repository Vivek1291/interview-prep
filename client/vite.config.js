import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// API_TARGET lets the dev server talk to another API (e.g. a throwaway test API on another port).
const api = process.env.API_TARGET || 'http://localhost:5050';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/uploads': api,
    },
  },
  build: {
    chunkSizeWarningLimit: 3000,
  },
});
