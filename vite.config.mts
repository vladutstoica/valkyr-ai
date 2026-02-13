import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => ({
  // Use relative asset paths in production so file:// loads work from DMG/app bundle
  base: command === 'build' ? './' : '/',
  plugins: [react(), tailwindcss()],
  root: './src/renderer',
  test: {
    dir: '.',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src/renderer'),
      '@shared': resolve(__dirname, './src/shared'),
      '#types': resolve(__dirname, './src/types'),
    },
  },
  server: {
    port: 3000,
  },
}));
