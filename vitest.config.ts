import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // one worker: suites share one migrated test database (rows are isolated per-household by design)
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
