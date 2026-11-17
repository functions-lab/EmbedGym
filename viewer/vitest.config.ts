import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts, which is the app's dev-server config and
// installs the results API.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
});
