import { json } from '@/lib/server/http'
import { trustedKeys } from '@/lib/server/keys'

/** Public keys this deployment signs with or accepts. Verifiers pin these. */
export function GET(): Response {
  return json({ keys: trustedKeys() }, { headers: { 'cache-control': 'public, max-age=3600' } })
}
