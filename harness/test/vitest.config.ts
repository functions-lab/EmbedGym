import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { embedGymParts } from '../../parts/vite-plugin';

const VELXIO_SRC = path.resolve(__dirname, '../../velxio/frontend/src');

export default defineConfig({
  plugins: [embedGymParts()],
  resolve: {
    alias: {
      '@velxio': VELXIO_SRC,
      '@pro': path.join(VELXIO_SRC, '__pro_stub__'),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
});
