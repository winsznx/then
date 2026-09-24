import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'
import {
  ADMIN_TOKEN,
  E2E_PORT,
  HOSTED_SEED,
  LOCAL_PUBLIC_KEY,
  SENTINEL_KEY,
  SESSION_SECRET,
  STATE_DIR,
} from './e2e/constants'

const baseURL = `http://127.0.0.1:${E2E_PORT}`

/**
 * Runs the production build against a seeded throwaway database. The root .env is never read, so
 * a real Nansen key cannot reach these tests; the sentinel key must not reach the browser.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec tsx e2e/seed.ts && pnpm exec next start -H 127.0.0.1 -p ${E2E_PORT}`,
    url: `${baseURL}/method`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      THEN_ENV_FILE: 'none',
      NANSEN_API_KEY: SENTINEL_KEY,
      THEN_PGLITE_DIR: resolve(STATE_DIR, 'pglite'),
      THEN_RECEIPT_SIGNING_KEY: HOSTED_SEED,
      THEN_SESSION_SECRET: SESSION_SECRET,
      THEN_TRUSTED_RECEIPT_KEYS: `local:${LOCAL_PUBLIC_KEY}`,
      THEN_STAMP_LIMIT_PER_HOUR: '0',
      THEN_ENABLE_INTERNAL_ROUTES: '1',
      THEN_ADMIN_TOKEN: ADMIN_TOKEN,
      THEN_PUBLIC_BASE_URL: baseURL,
    },
  },
})
