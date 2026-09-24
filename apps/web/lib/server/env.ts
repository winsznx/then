import 'server-only'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Repo root in development (apps/web → ../..), cwd in a packaged deployment. Computed on use so
 * nothing reads the filesystem at load time (Cloudflare Workers have no project directory).
 */
function repoRoot(): string {
  return existsSync(resolve(process.cwd(), '../../pnpm-workspace.yaml'))
    ? resolve(process.cwd(), '../..')
    : process.cwd()
}

/**
 * Development-only secrets are generated once and kept under .then/ (git-ignored). Production
 * never generates: a missing secret there is a configuration error, and the feature that needs it
 * refuses to run.
 */
function devSecret(name: string): string {
  const path = resolve(repoRoot(), '.then/keys', `${name}.hex`)
  if (existsSync(path)) return readFileSync(path, 'utf8').trim()
  const secret = randomBytes(32).toString('hex')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, secret, { mode: 0o600 })
  return secret
}

function secret(envName: string, devName: string): string | null {
  const value = process.env[envName]?.trim()
  if (value) return value
  return isProduction ? null : devSecret(devName)
}

export const env = {
  isProduction,
  nansenApiKey: process.env.NANSEN_API_KEY?.trim() || null,
  databaseUrl: process.env.DATABASE_URL?.trim() || null,
  /** Test-only override of the Nansen API origin (the e2e suite points it at a local mock). */
  nansenBaseUrl: process.env.THEN_NANSEN_BASE_URL?.trim() || null,
  get pgliteDir(): string {
    return resolve(repoRoot(), process.env.THEN_PGLITE_DIR ?? '.then/pglite')
  },
  signingSeed: secret('THEN_RECEIPT_SIGNING_KEY', 'web-signing-key'),
  sessionSecret: secret('THEN_SESSION_SECRET', 'web-session-secret'),
  trustedKeys: process.env.THEN_TRUSTED_RECEIPT_KEYS ?? '',
  disableHistorical: process.env.THEN_DISABLE_HISTORICAL === '1',
  stampsPerHour: Number(process.env.THEN_STAMP_LIMIT_PER_HOUR ?? 10),
  tradeMode: process.env.THEN_TRADE_MODE === 'live' ? ('live' as const) : ('paper' as const),
  publicBaseUrl: (process.env.THEN_PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  internalRoutes: process.env.THEN_ENABLE_INTERNAL_ROUTES === '1',
  adminToken: process.env.THEN_ADMIN_TOKEN?.trim() || null,
  /** Wallet-level membership detail needs recorded written approval from Nansen. Off by default. */
  publicMembershipDetail: process.env.THEN_PUBLIC_MEMBERSHIP_DETAIL === '1',
  githubUrl: process.env.THEN_GITHUB_URL ?? 'https://github.com/winsznx/then',
  /** The deployed commit, recorded in receipts and shown on /status. */
  gitSha:
    process.env.THEN_GIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    null,
}
