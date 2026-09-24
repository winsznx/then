import 'server-only'
import { ENDPOINTS, NansenClient, type LogEvent } from '@then/nansen'
import { env } from './env'

/** JSON lines on stdout. The client never hands headers to the logger, so no key reaches it. */
export function log(
  level: 'info' | 'warn' | 'error',
  entry: LogEvent | Record<string, unknown>,
): void {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), level, ...entry })}\n`)
}

let client: NansenClient | undefined

export function nansen(): NansenClient {
  client ??= new NansenClient({
    apiKey: env.nansenApiKey ?? undefined,
    ...(env.nansenBaseUrl ? { baseUrl: env.nansenBaseUrl } : {}),
    disableHistorical: env.disableHistorical,
    logger: { info: (entry) => log('info', entry), warn: (entry) => log('warn', entry) },
  })
  return client
}

let creditCache: { at: number; remaining: number | null } | undefined

/**
 * Remaining credits on the hosted key, refreshed at most once a minute (the account endpoint is
 * free). Null when the check itself fails.
 */
export async function remainingCredits(): Promise<number | null> {
  if (creditCache && Date.now() - creditCache.at < 60_000) return creditCache.remaining
  const result = await nansen().call(ENDPOINTS.account, undefined)
  creditCache = { at: Date.now(), remaining: result.ok ? result.data.credits_remaining : null }
  return creditCache.remaining
}

export function spentCredits(amount: number): void {
  if (creditCache && creditCache.remaining !== null) creditCache.remaining -= amount
}
