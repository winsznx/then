import { normalizeTokenAddress, type Chain } from '@then/core'
import { ENDPOINTS, type NansenClient, type SearchToken } from '@then/nansen'

export type TokenResolution =
  | { status: 'resolved'; address: string; via: 'claim' | 'nansen_search' }
  | { status: 'ambiguous'; candidates: { address: string; name: string; rank: number | null }[] }
  | { status: 'not_found' }
  | { status: 'invalid_address'; address: string }
  | { status: 'lookup_failed'; message: string }

/**
 * A claim's own contract address wins. Without one, Nansen search (0 credits) must return
 * exactly one token with that symbol on that chain; several matches are never guessed between.
 */
export async function resolveToken(
  client: NansenClient,
  chain: Chain,
  symbol: string,
  address: string,
): Promise<TokenResolution> {
  if (address.trim()) {
    const normalized = normalizeTokenAddress(chain, address)
    return normalized
      ? { status: 'resolved', address: normalized, via: 'claim' }
      : { status: 'invalid_address', address }
  }
  const result = await client.call(ENDPOINTS.searchGeneral, {
    search_query: symbol.replace(/^\$/, ''),
    result_type: 'token',
    chain,
    limit: 25,
  })
  if (!result.ok) return { status: 'lookup_failed', message: result.error.message }
  const wanted = symbol.replace(/^\$/, '').toLowerCase()
  const matches = (result.data.tokens ?? []).filter(
    (token: SearchToken) => token.chain === chain && token.symbol.toLowerCase() === wanted,
  )
  if (matches.length === 0) return { status: 'not_found' }
  if (matches.length > 1) {
    return {
      status: 'ambiguous',
      candidates: matches.map((token) => ({
        address: token.address,
        name: token.name,
        rank: token.rank ?? null,
      })),
    }
  }
  const normalized = normalizeTokenAddress(chain, matches[0]!.address)
  return normalized
    ? { status: 'resolved', address: normalized, via: 'nansen_search' }
    : { status: 'not_found' }
}
