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
    root: resolve(__dirname),
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: resolve(__dirname, 'coverage'),
      all: true,
      include: [
        'src/main/services/**/*.ts',
        'src/main/ipc/**/*.ts',
        'src/main/utils/**/*.ts',
        'src/shared/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/__tests__/**'],
    },
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'monaco-editor': ['monaco-editor', '@monaco-editor/react'],
          xterm: [
            '@xterm/xterm',
            '@xterm/addon-fit',
            '@xterm/addon-serialize',
            '@xterm/addon-web-links',
            '@xterm/addon-webgl',
          ],
        },
      },
    },
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
