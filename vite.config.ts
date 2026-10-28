import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // engine / game data / code in separate files: they download in parallel, and a code-only
        // release keeps the (big, rarely changing) data chunks cached in the browser
        manualChunks(id: string) {
          if (id.includes('node_modules/phaser')) return 'phaser';
          if (id.includes('/src/data/pokeapi/')) return 'data-pokeapi';
          if ((id.includes('/src/data/') && id.endsWith('.json')) || id.endsWith('pmdGround.json')) return 'data-game';
          return undefined;
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // socket tests wait on real timers; too many parallel files starve them and time out
    poolOptions: { threads: { minThreads: 1, maxThreads: 4 }, forks: { minForks: 1, maxForks: 4 } },
  },
} as never);
