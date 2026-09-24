import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { NansenClient, type LogEvent, type Logger } from '@then/nansen'
import {
  FIXTURE_SIGNING_KEY,
  generateSigningKey,
  keyIdOf,
  signingKeyFromSeed,
  trustedKeyOf,
  type KeyRole,
  type SigningKey,
  type TrustedKey,
} from '@then/receipt'
import { bytesToHex } from '@noble/hashes/utils.js'

export const EXIT = {
  OK: 0,
  INSUFFICIENT: 2,
  VERIFY_MISMATCH: 3,
  CONFIG: 4,
  ABLATION: 5,
} as const

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message)
  }
}

export function loadDotEnv(): void {
  if (existsSync('.env')) process.loadEnvFile('.env')
}

export function historicalDisabled(): boolean {
  return process.env.THEN_DISABLE_HISTORICAL === '1'
}

/** Structured stderr logs. The client never passes headers here, so the key cannot appear. */
export const stderrLogger = (verbose: boolean): Logger => ({
  info: (entry: LogEvent) => {
    if (verbose) process.stderr.write(`${JSON.stringify(entry)}\n`)
  },
  warn: (entry: LogEvent) => process.stderr.write(`${JSON.stringify(entry)}\n`),
})

export function nansenClient(
  options: { verbose?: boolean; requireKey?: boolean } = {},
): NansenClient {
  const apiKey = process.env.NANSEN_API_KEY
  if (options.requireKey !== false && !apiKey?.trim()) {
    throw new CliError('NANSEN_API_KEY is not set. Put it in .env (see .env.example).', EXIT.CONFIG)
  }
  return new NansenClient({
    apiKey,
    disableHistorical: historicalDisabled(),
    logger: stderrLogger(options.verbose ?? false),
  })
}

const LOCAL_KEY_PATH = resolve('.then/keys/local-signing-key.hex')

/**
 * Receipts stamped from this machine are signed with THEN_RECEIPT_SIGNING_KEY when set, otherwise
 * with a local key created on first use under .then/ (git-ignored).
 */
export async function localSigningKey(): Promise<SigningKey> {
  const seed = process.env.THEN_RECEIPT_SIGNING_KEY?.trim()
  if (seed)
    return signingKeyFromSeed(seed, (process.env.THEN_RECEIPT_KEY_ROLE as KeyRole) || 'local')
  if (existsSync(LOCAL_KEY_PATH))
    return signingKeyFromSeed(await readFile(LOCAL_KEY_PATH, 'utf8'), 'local')
  const key = generateSigningKey('local')
  await mkdir(dirname(LOCAL_KEY_PATH), { recursive: true })
  await writeFile(LOCAL_KEY_PATH, bytesToHex(key.secret), { mode: 0o600 })
  return key
}

/**
 * Keys a verifier accepts: the public fixture key, this machine's local key, and any keys in
 * THEN_TRUSTED_RECEIPT_KEYS ("role:hexpublickey,…"), such as the hosted deployment's key.
 */
export async function trustedKeys(): Promise<TrustedKey[]> {
  const keys: TrustedKey[] = [trustedKeyOf(FIXTURE_SIGNING_KEY)]
  if (process.env.THEN_RECEIPT_SIGNING_KEY || existsSync(LOCAL_KEY_PATH))
    keys.push(trustedKeyOf(await localSigningKey()))
  for (const entry of (process.env.THEN_TRUSTED_RECEIPT_KEYS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [role, hex] = entry.includes(':') ? entry.split(':') : ['hosted', entry]
    if (hex) keys.push({ key_id: keyIdOf(hex), role: role as KeyRole, public_key_hex: hex })
  }
  return keys
}

export function gitSha(): string | null {
  const fromEnv =
    process.env.THEN_GIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.RAILWAY_GIT_COMMIT_SHA
  if (fromEnv) return fromEnv
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // Not a git checkout (e.g. a packaged CLI): receipts record the sha as unknown.
    return null
  }
}
