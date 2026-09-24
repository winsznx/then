import { CHAINS } from '@then/core'
import { ENDPOINTS } from '@then/nansen'
import { getRepo } from '@/lib/server/db'
import { handleError, json, problem } from '@/lib/server/http'
import { nansen } from '@/lib/server/nansen'
import { clientKey } from '@/lib/server/session'

/**
 * Token lookup through Nansen search (0 credits). Several matches are returned as a list for the
 * user to choose from; the server never picks one.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 64)
    const chain = url.searchParams.get('chain') ?? ''
    if (q.length < 2) return json({ tokens: [] })
    if (!(CHAINS as readonly string[]).includes(chain))
      return problem(422, 'UNSUPPORTED_CHAIN', 'Pick a supported chain first.')
    const repo = await getRepo()
    if ((await repo.hitRateLimit('search', await clientKey(), 60)) >= 30)
      return problem(429, 'RATE_LIMITED', 'Too many searches. Try again in a minute.')
    const result = await nansen().call(ENDPOINTS.searchGeneral, {
      search_query: q,
      result_type: 'token',
      chain,
      limit: 10,
    })
    if (!result.ok)
      return problem(
        502,
        'SEARCH_UNAVAILABLE',
        'Token search is unavailable. Paste the contract address instead.',
      )
    const tokens = (result.data.tokens ?? [])
      .filter((token) => token.chain === chain)
      .map((token) => ({
        name: token.name,
        symbol: token.symbol,
        address: token.address,
        rank: token.rank ?? null,
      }))
    return json({ tokens }, { headers: { 'cache-control': 'private, max-age=60' } })
  } catch (error) {
    return handleError(error)
  }
}
