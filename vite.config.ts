/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative base so the build works from any static host sub-folder.
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 60000,
  },
});
