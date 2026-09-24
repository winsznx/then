import { describe, expect, it } from 'vitest'
import { ENDPOINTS, NansenClient } from '../src'

const enabled = process.env.THEN_LIVE_TESTS === '1' && Boolean(process.env.NANSEN_API_KEY)

/**
 * Contract checks against the real API, using only endpoints that cost 0 credits. They catch a
 * changed response shape before a stamp does. Run with `pnpm test:live` and a key in .env.
 */
describe.skipIf(!enabled)('Nansen adapters, live', () => {
  const client = new NansenClient({ apiKey: process.env.NANSEN_API_KEY })

  it('reads the account without spending credits', async () => {
    // #when the account is read
    const result = await client.call(ENDPOINTS.account, undefined)
    // #then it parses under the published schema and reports its remaining credits
    expect(result.ok && typeof result.data.credits_remaining === 'number').toBe(true)
  })

  it('searches tokens under the published schema', async () => {
    // #when a well-known token is searched on one chain
    const result = await client.call(ENDPOINTS.searchGeneral, {
      search_query: 'WIF',
      result_type: 'token',
      chain: 'solana',
      limit: 5,
    })
    // #then the response parses and lists at least one Solana token
    expect(result.ok && (result.data.tokens ?? []).some((token) => token.chain === 'solana')).toBe(
      true,
    )
  })
})
