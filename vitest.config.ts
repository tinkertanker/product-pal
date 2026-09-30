import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so tests do not start the Workers runtime.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
    environment: 'node',
  },
});
