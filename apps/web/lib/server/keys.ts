import 'server-only'
import {
  FIXTURE_SIGNING_KEY,
  parseTrustedKeys,
  signingKeyFromSeed,
  trustedKeyOf,
  type SigningKey,
  type TrustedKey,
} from '@then/receipt'
import { env } from './env'
import { log } from './nansen'

let cached: SigningKey | null | undefined
let warnedRejected = false

/** The key hosted stamps are signed with. Null in production without THEN_RECEIPT_SIGNING_KEY. */
export function hostedSigningKey(): SigningKey | null {
  if (cached !== undefined) return cached
  cached = env.signingSeed ? signingKeyFromSeed(env.signingSeed, 'hosted') : null
  return cached
}

/**
 * Keys this deployment accepts: its own, the published fixture key (reported as fixture, never as
 * live), and keys in THEN_TRUSTED_RECEIPT_KEYS such as the operator's CLI key ("local:<hex>").
 */
export function trustedKeys(): TrustedKey[] {
  const keys: TrustedKey[] = [trustedKeyOf(FIXTURE_SIGNING_KEY)]
  const hosted = hostedSigningKey()
  if (hosted) keys.push(trustedKeyOf(hosted))
  const configured = parseTrustedKeys(env.trustedKeys)
  if (configured.rejected.length > 0 && !warnedRejected) {
    warnedRejected = true
    log('warn', { event: 'keys.rejected_entries', count: configured.rejected.length })
  }
  return [...keys, ...configured.keys]
}
