import { describe, expect, it } from 'vitest'
import {
  ENDPOINTS,
  NansenClient,
  collectPages,
  type CapturedPayload,
  type EndpointSpec,
  type LogEvent,
} from '../src'

const KEY = 'nsn_test_key_0123456789abcdef'

interface Scripted {
  status: number
  body: unknown
  headers?: Record<string, string>
}

function scriptedFetch(responses: Scripted[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    const next = responses.shift()
    if (!next) throw new Error('unexpected request')
    return new Response(typeof next.body === 'string' ? next.body : JSON.stringify(next.body), {
      status: next.status,
      headers: next.headers,
    })
  }) as typeof fetch
  return { impl, calls }
}

function client(
  fetchImpl: typeof fetch,
  overrides: Partial<ConstructorParameters<typeof NansenClient>[0]> = {},
) {
  return new NansenClient({ apiKey: KEY, fetch: fetchImpl, sleep: async () => {}, ...overrides })
}

const wbsBody = {
  data: [
    {
      address: 'A1',
      address_label: 'Smart Trader',
      bought_token_volume: 10,
      sold_token_volume: 2,
      bought_volume_usd: 100,
      sold_volume_usd: 20,
    },
  ],
  pagination: { page: 1, per_page: 100, is_last_page: true },
}

describe('NansenClient', () => {
  it('sends the key only in the apikey header and captures the raw payload with credit headers', async () => {
    const { impl, calls } = scriptedFetch([
      {
        status: 200,
        body: wbsBody,
        headers: {
          'x-nansen-credits-used': '1',
          'x-nansen-credits-remaining': '91',
          'x-request-id': 'req-1',
        },
      },
    ])
    const captured: CapturedPayload[] = []
    const result = await client(impl).call(
      ENDPOINTS.whoBoughtSold,
      {
        chain: 'solana',
        token_address: 'T',
        date: { from: '2026-06-12', to: '2026-06-12' },
        buy_or_sell: 'BUY',
        pagination: { page: 1, per_page: 100 },
      },
      { onPayload: (payload) => captured.push(payload) },
    )
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(1)
    const headers = new Headers(calls[0]!.init.headers)
    expect(headers.get('apikey')).toBe(KEY)
    expect(calls[0]!.url).not.toContain(KEY)
    expect(String(calls[0]!.init.body)).not.toContain(KEY)
    expect(captured).toHaveLength(1)
    expect(captured[0]!.credits_used).toBe(1)
    expect(captured[0]!.credits_remaining).toBe(91)
    expect(captured[0]!.request_id).toBe('req-1')
    expect(captured[0]!.body_hash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(JSON.stringify(captured[0])).not.toContain(KEY)
  })

  it('retries 429 and honors Retry-After, then succeeds', async () => {
    const waits: number[] = []
    const { impl, calls } = scriptedFetch([
      {
        status: 429,
        body: { message: 'slow down', code: 'rate_limit_exceeded' },
        headers: { 'retry-after': '2' },
      },
      { status: 200, body: wbsBody },
    ])
    const result = await client(impl, { sleep: async (ms) => void waits.push(ms) }).call(
      ENDPOINTS.whoBoughtSold,
      {},
    )
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(2)
    expect(waits).toEqual([2000])
  })

  it('never retries 401 and parses the gateway body that has no code field', async () => {
    const { impl, calls } = scriptedFetch([
      {
        status: 401,
        body: { message: 'Invalid API key. Manage your keys at https://app.nansen.ai/api?tab=api' },
      },
    ])
    const result = await client(impl).call(ENDPOINTS.whoBoughtSold, {})
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(calls).toHaveLength(1)
    expect(result.error.kind).toBe('auth')
    expect(result.error.retryable).toBe(false)
    expect(result.error.message).toContain('Invalid API key')
  })

  it('never retries 400, 403, or 422', async () => {
    for (const status of [400, 403, 422]) {
      const { impl, calls } = scriptedFetch([
        { status, body: { code: 'invalid_field_value', message: 'bad' } },
      ])
      const result = await client(impl).call(ENDPOINTS.whoBoughtSold, {})
      expect(result.ok).toBe(false)
      expect(calls).toHaveLength(1)
    }
  })

  it('gives up after two retries on persistent 503', async () => {
    const { impl, calls } = scriptedFetch([
      { status: 503, body: { code: 'upstream_unavailable' } },
      { status: 503, body: { code: 'upstream_unavailable' } },
      { status: 503, body: { code: 'upstream_unavailable' } },
    ])
    const result = await client(impl).call(ENDPOINTS.whoBoughtSold, {})
    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(3)
  })

  it('fails every point-in-time surface closed under ablation without touching the network', async () => {
    const { impl, calls } = scriptedFetch([])
    const nansen = client(impl, { disableHistorical: true })
    const asofSpecs = (Object.values(ENDPOINTS) as EndpointSpec[]).filter(
      (endpoint) => endpoint.surface === 'asof',
    )
    expect(asofSpecs.length).toBeGreaterThan(0)
    for (const spec of asofSpecs) {
      const result = await nansen.call(spec, {})
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('SPONSOR_HISTORICAL_DISABLED')
    }
    expect(calls).toHaveLength(0)
  })

  it('classifies smart-money historical holdings as point-in-time, not live', () => {
    expect(ENDPOINTS.smHistoricalHoldings.surface).toBe('asof')
    for (const spec of Object.values(ENDPOINTS) as EndpointSpec[]) {
      if (spec.path.startsWith('/api/v1beta1/')) expect(spec.surface).toBe('asof')
    }
  })

  it('refuses to call without a key', async () => {
    const { impl, calls } = scriptedFetch([])
    const result = await new NansenClient({ apiKey: '  ', fetch: impl }).call(
      ENDPOINTS.whoBoughtSold,
      {},
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('missing_key')
    expect(calls).toHaveLength(0)
  })

  it('reports schema drift instead of inventing rows', async () => {
    const { impl } = scriptedFetch([
      {
        status: 200,
        body: {
          data: [{ wallet: 'A1' }],
          pagination: { page: 1, per_page: 10, is_last_page: true },
        },
      },
    ])
    const result = await client(impl).call(ENDPOINTS.whoBoughtSold, {})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_DRIFT')
      expect(result.payload?.body).toContain('wallet')
    }
  })

  it('lists unexpected fields without failing the call', async () => {
    const body = structuredClone(wbsBody) as {
      data: Record<string, unknown>[]
      pagination: object
      extra?: number
    }
    body.data[0]!.new_field = 1
    body.extra = 2
    const { impl } = scriptedFetch([{ status: 200, body }])
    const result = await client(impl).call(ENDPOINTS.whoBoughtSold, {})
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.drift).toEqual(['data[].new_field', 'extra'])
  })

  it('never logs the key', async () => {
    const entries: LogEvent[] = []
    const logger = {
      info: (entry: LogEvent) => void entries.push(entry),
      warn: (entry: LogEvent) => void entries.push(entry),
    }
    const { impl } = scriptedFetch([
      { status: 429, body: { code: 'rate_limit_exceeded' } },
      { status: 200, body: wbsBody },
    ])
    await client(impl, { logger }).call(ENDPOINTS.whoBoughtSold, {})
    expect(entries.length).toBeGreaterThan(0)
    expect(JSON.stringify(entries)).not.toContain(KEY)
  })

  it('maps a client-side timeout to UPSTREAM_TIMEOUT', async () => {
    const hanging = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      })) as typeof fetch
    const result = await client(hanging, { timeoutMs: 20, maxRetries: 0 }).call(
      ENDPOINTS.whoBoughtSold,
      {},
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UPSTREAM_TIMEOUT')
  })
})

describe('collectPages', () => {
  it('stops at is_last_page and reports truncation at the cap', async () => {
    const page = (n: number, last: boolean) => ({
      status: 200,
      body: {
        data: [{ address: `A${n}` }],
        pagination: { page: n, per_page: 1, is_last_page: last },
      },
    })
    const done = scriptedFetch([page(1, false), page(2, true)])
    const complete = await collectPages(
      client(done.impl),
      ENDPOINTS.whoBoughtSold,
      (p) => ({ pagination: { page: p, per_page: 1 } }),
      5,
    )
    expect(complete.ok && complete.rows.length).toBe(2)
    expect(complete.ok && complete.truncated).toBe(false)

    const capped = scriptedFetch([page(1, false), page(2, false)])
    const truncated = await collectPages(
      client(capped.impl),
      ENDPOINTS.whoBoughtSold,
      (p) => ({ pagination: { page: p, per_page: 1 } }),
      2,
    )
    expect(truncated.ok && truncated.truncated).toBe(true)
  })
})
