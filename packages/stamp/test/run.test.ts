import type { Claim } from '@then/core'
import { TOKEN, asofTrades, attribution, liveTrades, price } from '@then/fixtures'
import { NansenClient } from '@then/nansen'
import { describe, expect, it } from 'vitest'
import { planStamp, runStamp } from '../src'

const NOW = new Date('2026-09-24T10:00:00Z')
const D = '2026-06-12'

const claim: Claim = {
  claim_type: 'SM_BOUGHT',
  chain: 'ethereum',
  token_address: TOKEN,
  as_of_date: D,
  window_hours: 24,
  sm_label_set: [
    'Smart Trader',
    '30D Smart Trader',
    '90D Smart Trader',
    '180D Smart Trader',
    'Smart HL Perps Trader',
  ],
  min_usd: 1000,
  quote_asset: 'USD',
}

/** Serves synthetic bodies by endpoint path; records every request body. */
function fakeNansen(
  bodies: Record<string, string | ((request: Record<string, unknown>) => string)>,
) {
  const requests: { path: string; body: Record<string, unknown> }[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    requests.push({ path, body })
    const entry = bodies[path]
    if (entry === undefined)
      return new Response(JSON.stringify({ message: 'not scripted' }), { status: 500 })
    const text = typeof entry === 'function' ? entry(body) : entry
    return new Response(text, { status: 200, headers: { 'x-nansen-credits-used': '1' } })
  }) as typeof fetch
  const client = new NansenClient({
    apiKey: 'nsn_test',
    fetch: fetchImpl,
    sleep: async () => {},
    maxRetries: 0,
  })
  return { client, requests }
}

const priceBody = price([
  { day: '2026-06-11', close: 1, volume: 100_000, volume_usd: 100_000 },
  { day: D, close: 1, volume: 100_000, volume_usd: 100_000 },
]).bodies[0]!

describe('runStamp', () => {
  it('refuses an unsettled date without calling Nansen', async () => {
    // #given
    const { client, requests } = fakeNansen({})
    // #when
    const run = await runStamp({ ...claim, as_of_date: '2026-09-24' }, { client, now: () => NOW })
    // #then
    expect({ verdict: run.result.verdict, calls: requests.length }).toEqual({
      verdict: 'INSUFFICIENT',
      calls: 0,
    })
  })

  it('refuses perp claims without calling Nansen', async () => {
    // #given
    const { client, requests } = fakeNansen({})
    // #when
    const run = await runStamp({ ...claim, claim_type: 'SM_PERP' }, { client, now: () => NOW })
    // #then
    expect({ reason: run.result.reasons[0], calls: requests.length }).toEqual({
      reason: 'UNSUPPORTED_CLAIM_TYPE',
      calls: 0,
    })
  })

  it('refuses trade claims on chains without wallet history', async () => {
    // #given
    const { client, requests } = fakeNansen({})
    // #when
    const run = await runStamp({ ...claim, chain: 'arbitrum' }, { client, now: () => NOW })
    // #then
    expect({ reason: run.result.reasons[0], calls: requests.length }).toEqual({
      reason: 'UNSUPPORTED_CHAIN',
      calls: 0,
    })
  })

  it('runs the attribution lookup only when contamination depends on it', async () => {
    // #given
    const { client, requests } = fakeNansen({
      '/api/v1/tgm/dex-trades': liveTrades([
        { trader: 1, action: 'BUY', amount: 5000, day: D, n: 1 },
      ]).bodies[0]!,
      '/api/v1beta1/tgm/historical-dex-trades': (body) =>
        (body.filters as { trader_address?: string } | undefined)?.trader_address
          ? attribution(1, [{ day: D, label: 'Whale' }]).bodies[0]!
          : asofTrades([]).bodies[0]!,
      '/api/v1/tgm/token-ohlcv': priceBody,
    })
    // #when
    const run = await runStamp(claim, { client, now: () => NOW })
    // #then
    expect({
      verdict: run.result.verdict,
      lookups: requests.filter(
        (r) => (r.body.filters as { trader_address?: string } | undefined)?.trader_address,
      ).length,
    }).toEqual({ verdict: 'CONTAMINATED', lookups: 1 })
  })

  it('skips the attribution lookup for a VALID claim', async () => {
    // #given
    const trades = [{ trader: 1, action: 'BUY' as const, amount: 3000, day: D, n: 1 }]
    const { client, requests } = fakeNansen({
      '/api/v1/tgm/dex-trades': liveTrades(trades).bodies[0]!,
      '/api/v1beta1/tgm/historical-dex-trades': asofTrades(trades).bodies[0]!,
      '/api/v1/tgm/token-ohlcv': priceBody,
    })
    // #when
    const run = await runStamp(claim, { client, now: () => NOW })
    // #then
    expect({ verdict: run.result.verdict, calls: requests.length }).toEqual({
      verdict: 'VALID',
      calls: 3,
    })
  })

  it('under ablation makes no point-in-time calls and cannot stamp VALID', async () => {
    // #given a client whose fetch throws on any point-in-time path
    const client = new NansenClient({
      apiKey: 'nsn_test',
      fetch: liveOnlyFetch(),
      disableHistorical: true,
    })
    // #when
    const run = await runStamp(claim, { client, now: () => NOW })
    // #then
    expect(run.result.reasons[0]).toBe('SPONSOR_HISTORICAL_DISABLED')
  })

  it('records every raw response and the credits it used', async () => {
    // #given
    const trades = [{ trader: 1, action: 'BUY' as const, amount: 3000, day: D, n: 1 }]
    const { client } = fakeNansen({
      '/api/v1/tgm/dex-trades': liveTrades(trades).bodies[0]!,
      '/api/v1beta1/tgm/historical-dex-trades': asofTrades(trades).bodies[0]!,
      '/api/v1/tgm/token-ohlcv': priceBody,
    })
    // #when
    const run = await runStamp(claim, { client, now: () => NOW })
    // #then
    expect({ payloads: run.payloads.length, credits: run.credits_used }).toEqual({
      payloads: 3,
      credits: 3,
    })
  })
})

function liveOnlyFetch(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname
    if (path.startsWith('/api/v1beta1/') || path === '/api/v1/smart-money/historical-holdings') {
      throw new Error(`point-in-time endpoint called under ablation: ${path}`)
    }
    if (path === '/api/v1/tgm/token-ohlcv') return new Response(priceBody, { status: 200 })
    return new Response(
      liveTrades([{ trader: 1, action: 'BUY', amount: 3000, day: D, n: 1 }]).bodies[0]!,
      { status: 200 },
    )
  }) as typeof fetch
}

describe('planStamp look-ahead guard', () => {
  it('ends every as-of trade request on the claim date', () => {
    // #given
    const plan = planStamp(
      claim,
      { from: D, to: D, days: 1 },
      { today: '2026-09-24', maxPerPage: 1000, corroborate: true },
    )
    // #when
    const ends = plan.sources
      .filter((s) => s.spec.surface === 'asof' && s.source !== 'asof_snapshot')
      .map((s) => (s.request(1) as { date_range: { to: string } }).date_range.to)
    // #then
    expect(new Set(ends)).toEqual(new Set([D]))
  })

  it('sends legacy label aliases to point-in-time endpoints and never sends Fund to live ones', () => {
    // #given
    const plan = planStamp(
      { ...claim, sm_label_set: [...claim.sm_label_set, 'Fund'] },
      { from: D, to: D, days: 1 },
      { today: '2026-09-24', maxPerPage: 1000, corroborate: false },
    )
    // #when
    const asof = plan.sources.find((s) => s.source === 'asof_trades')!.request(1) as {
      filters: { include_labels: string[] }
    }
    const live = plan.sources.find((s) => s.source === 'live_trades')!.request(1) as {
      filters: { include_smart_money_labels: string[] }
    }
    // #then
    expect({
      asofHasAlias: asof.filters.include_labels.includes('90D Smart Dex Trader'),
      liveHasFund: live.filters.include_smart_money_labels.includes('Fund'),
    }).toEqual({ asofHasAlias: true, liveHasFund: false })
  })
})
