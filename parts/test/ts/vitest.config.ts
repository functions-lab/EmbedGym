import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { embedGymParts } from '../../vite-plugin';

const VELXIO_SRC = path.resolve(__dirname, '../../../velxio/frontend/src');

// Same settings as velxio/frontend/vitest.config.ts, which these tests ran
// under before they moved out of velxio.
export default defineConfig({
  plugins: [embedGymParts()],
  resolve: {
    alias: {
      '@velxio': VELXIO_SRC,
      '@pro': path.join(VELXIO_SRC, '__pro_stub__'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    forks: {
      singleFork: false,
      execArgv: ['--max-old-space-size=8192'],
    },
  },
});
