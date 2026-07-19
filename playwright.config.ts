import { defineConfig, devices } from '@playwright/test'

const adminUrl = process.env.DATABASE_URL ?? 'postgres://finance:finance@localhost:5433/finance'
const e2eDbUrl = adminUrl.replace(/\/[^/]+$/, '/finance_e2e')

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3010',
    ...devices['Desktop Chrome'],
    viewport: { width: 390, height: 844 }, // phone-sized: the app is mobile-first
  },
  webServer: {
    command: 'node e2e/reset-db.mjs && npx tsx src/index.ts',
    url: 'http://localhost:3010/healthz',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: '3010',
      DATABASE_URL: e2eDbUrl,
      BETTER_AUTH_URL: 'http://localhost:3010',
      BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret',
    },
  },
})
