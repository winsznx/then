import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'
import base, { mockNansen } from './playwright.config'
import {
  ADMIN_TOKEN,
  E2E_PORT,
  HOSTED_SEED,
  LOCAL_PUBLIC_KEY,
  MOCK_NANSEN_PORT,
  SENTINEL_KEY,
  SESSION_SECRET,
} from './e2e/constants'

/**
 * The same suite against the Cloudflare build running in workerd (`wrangler dev`), with a local
 * throwaway Postgres (E2E_DATABASE_URL, e.g. a Docker container) instead of the embedded store.
 * Run `pnpm build:cf` first. Tests tagged @limit depend on per-client addresses, which workerd
 * reports as one local address, so they run only in the Node suite.
 */
const database = process.env.E2E_DATABASE_URL
if (!database) throw new Error('Set E2E_DATABASE_URL to a local throwaway Postgres')

// Absolute: wrangler resolves a relative path against the generated config's directory.
const envFile = resolve('e2e/.worker.env')
writeFileSync(
  envFile,
  [
    `NANSEN_API_KEY=${SENTINEL_KEY}`,
    `THEN_NANSEN_BASE_URL=http://127.0.0.1:${MOCK_NANSEN_PORT}`,
    `DATABASE_URL=${database}`,
    `THEN_RECEIPT_SIGNING_KEY=${HOSTED_SEED}`,
    `THEN_SESSION_SECRET=${SESSION_SECRET}`,
    `THEN_TRUSTED_RECEIPT_KEYS=local:${LOCAL_PUBLIC_KEY}`,
    'THEN_STAMP_LIMIT_PER_HOUR=100',
    'THEN_ENABLE_INTERNAL_ROUTES=1',
    `THEN_ADMIN_TOKEN=${ADMIN_TOKEN}`,
    `THEN_PUBLIC_BASE_URL=http://127.0.0.1:${E2E_PORT}`,
  ].join('\n'),
)

export default defineConfig({
  ...base,
  grepInvert: /@limit/,
  webServer: [
    mockNansen,
    {
      command: `pnpm exec tsx e2e/seed.ts && pnpm exec wrangler dev --config dist/server/wrangler.json --ip 127.0.0.1 --port ${E2E_PORT} --env-file ${envFile} --show-interactive-dev-session=false`,
      url: `http://127.0.0.1:${E2E_PORT}/method`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { E2E_DATABASE_URL: database },
    },
  ],
})
