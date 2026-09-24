import { expect, test } from '@playwright/test'
import { ADMIN_TOKEN, SENTINEL_KEY } from './constants'
import { seed } from './state'

const PAGES = [
  '/',
  '/inspect',
  '/challenge',
  '/challenge/archive',
  '/corpus',
  '/method',
  '/limits',
  '/about-data',
]

test.describe('the Nansen key never reaches the browser', () => {
  test('is absent from every page and every script those pages load', async ({ page, request }) => {
    // #given every public page plus a receipt page
    const paths = [...PAGES, `/r/${seed().receipts.P2.receipt_id}`]
    const scripts = new Set<string>()
    const leaks: string[] = []
    // #when each page and each script it references is fetched
    for (const path of paths) {
      const response = await page.goto(path)
      if ((await response!.text()).includes(SENTINEL_KEY)) leaks.push(path)
      const sources = await page
        .locator('script[src]')
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLScriptElement).src))
      for (const src of sources) scripts.add(src)
    }
    for (const src of scripts)
      if ((await (await request.get(src)).text()).includes(SENTINEL_KEY)) leaks.push(src)
    // #then the sentinel key is nowhere
    expect({ scriptsChecked: scripts.size > 0, leaks }).toEqual({ scriptsChecked: true, leaks: [] })
  })

  test('the browser only talks to this origin', async ({ page, baseURL }) => {
    // #given a record of every request the page makes
    const origin = new URL(baseURL!).origin
    const foreign: string[] = []
    page.on('request', (req) => {
      const url = new URL(req.url())
      if (url.protocol.startsWith('http') && url.origin !== origin) foreign.push(req.url())
    })
    // #when the main flows run
    await page.goto('/')
    await page.goto('/inspect')
    await page.getByRole('button', { name: 'Load example' }).click()
    await page.getByRole('button', { name: 'Verify integrity' }).click()
    await expect(page.getByText(/Integrity verified in this browser/)).toBeVisible()
    await page.goto('/challenge')
    // #then nothing left the origin
    expect(foreign).toEqual([])
  })

  test('pages carry a nonce-based CSP that allows only this origin', async ({ request }) => {
    // #when a page is requested
    const response = await request.get('/inspect')
    const headers = response.headers()
    // #then scripts need the nonce and connections stay on this origin
    expect({
      script: /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/.test(
        headers['content-security-policy'] ?? '',
      ),
      connect: (headers['content-security-policy'] ?? '').includes("connect-src 'self';"),
      frame: headers['x-frame-options'],
    }).toEqual({ script: true, connect: true, frame: 'DENY' })
  })
})

test.describe('a replay never passes as live', () => {
  test('receipt page and receipt API are marked replay', async ({ request }) => {
    // #given a stored receipt
    const id = seed().receipts.P1.receipt_id
    // #when its page and JSON are fetched
    const pageResponse = await request.get(`/r/${id}`)
    const apiResponse = await request.get(`/api/receipt/${id}`)
    // #then both carry the replay header
    expect([pageResponse.headers()['x-then-mode'], apiResponse.headers()['x-then-mode']]).toEqual([
      'replay',
      'replay',
    ])
  })

  test('a stored receipt is labeled REPLAY and never LIVE STAMP', async ({ page }) => {
    // #when a receipt page is opened
    await page.goto(`/r/${seed().receipts.P1.receipt_id}`)
    // #then
    await expect(page.getByText('REPLAY', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('LIVE STAMP', { exact: true })).toHaveCount(0)
  })
})

test.describe('private evidence', () => {
  test('is served only with the admin token', async ({ request }) => {
    // #given the private evidence route of a stored receipt
    const url = `/api/internal/receipt/${seed().receipts.P1.receipt_id}/evidence`
    // #when it is requested without, with a wrong, and with the right token
    const statuses = [
      (await request.get(url)).status(),
      (await request.get(url, { headers: { authorization: 'Bearer not-the-token' } })).status(),
      (await request.get(url, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } })).status(),
    ]
    // #then only the right token gets through
    expect(statuses).toEqual([401, 401, 200])
  })

  test('never appears in the public receipt or its page', async ({ request }) => {
    // #given a receipt's public JSON, its page, and its private bundle
    const id = seed().receipts.P1.receipt_id
    const publicText = `${await (await request.get(`/api/receipt/${id}`)).text()}${await (await request.get(`/r/${id}`)).text()}`
    const bundle = await (
      await request.get(`/api/internal/receipt/${id}/evidence`, {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      })
    ).json()
    const token = (await (await request.get(`/api/receipt/${id}`)).json()).claim
      .token_address as string
    const wallets = [
      ...new Set(
        (JSON.stringify(bundle.records)
          .toLowerCase()
          .match(/0x[0-9a-f]{40}/g) ?? []) as string[],
      ),
    ].filter((wallet) => wallet !== token)
    // #then no private wallet is in the public receipt
    expect({
      walletsInBundle: wallets.length > 0,
      leaked: wallets.filter((wallet) => publicText.toLowerCase().includes(wallet)),
    }).toEqual({
      walletsInBundle: true,
      leaked: [],
    })
  })
})

test.describe('receipt ids', () => {
  test('cannot reach anything outside the receipt store', async ({ request }) => {
    // #when malformed or traversing ids are requested
    const statuses = await Promise.all(
      [
        '..%2F..%2Fetc%2Fpasswd',
        'rcpt_%2E%2E%2Fsecret',
        'rcpt_AAAAAAAAAAAAAAAAAAAA',
        '%2e%2e%2fpackage.json',
      ].map(async (id) => [
        (await request.get(`/api/receipt/${id}`)).status(),
        (await request.get(`/r/${id}`)).status(),
      ]),
    )
    // #then every one is a plain 404
    expect(statuses.flat().every((status) => status === 404)).toBe(true)
  })
})

test.describe('historical data switched off', () => {
  test('turns VALID and CONTAMINATED into INSUFFICIENT', async ({ request }) => {
    // #given the VALID and CONTAMINATED receipts
    const { P1, P2 } = seed().receipts
    // #when each is replayed without point-in-time sources
    const results = await Promise.all(
      [P1, P2].map(async ({ receipt_id }) =>
        (
          await request.post('/api/internal/ablation', {
            data: { receipt_id },
            headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
          })
        ).json(),
      ),
    )
    // #then neither verdict survives
    expect(results.map((result) => [result.original, result.without_historical])).toEqual([
      ['CONTAMINATED', 'INSUFFICIENT'],
      ['VALID', 'INSUFFICIENT'],
    ])
  })
})

test.describe('the hosted key is rate limited', () => {
  test('a stamp over the per-client limit is refused before Nansen is called', async ({
    request,
  }) => {
    // #given a deployment whose limit is zero stamps per hour
    // #when a valid claim is submitted
    const response = await request.post('/api/stamp', {
      data: {
        claim_type: 'SM_BOUGHT',
        chain: 'solana',
        token_address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
        as_of_date: '2026-06-12',
      },
    })
    // #then it is refused with 429
    expect({ status: response.status(), code: (await response.json()).error.code }).toEqual({
      status: 429,
      code: 'RATE_LIMITED',
    })
  })
})
