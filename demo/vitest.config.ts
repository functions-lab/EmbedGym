import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { embedGymParts } from '../parts/vite-plugin';

// Node-only: these cover the data layer and the hardcoded tables. Anything
// needing a browser (grading, the canvas) is smoke-tested by test/smoke.mjs.
export default defineConfig({
  plugins: [embedGymParts()],
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**'],
  },
  resolve: {
    alias: {
      '@velxio': path.resolve(__dirname, '../velxio/frontend/src'),
      '@harness': path.resolve(__dirname, '../harness'),
    },
  },
});
