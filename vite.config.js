import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the bundle also works when loaded from the Capacitor WebView.
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    assetsInlineLimit: 0,
    // Phaser alone is ~1.2 MB minified: expected for a game bundle.
    chunkSizeWarningLimit: 2000,
  },
  server: {
    host: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
