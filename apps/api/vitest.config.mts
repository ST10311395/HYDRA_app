import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/globalSetup.ts'],
    setupFiles: ['./tests/setupEnv.ts'],
    include: ['tests/**/*.test.ts'],
    // Integration tests share one PostgreSQL test database: run files sequentially.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
    pool: 'forks',
  },
});
