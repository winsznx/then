import { expect, test } from '@playwright/test'
import { MOCK_CLAIM } from './constants'

test.describe('stamping', () => {
  test('streams accepted, each stage, and the receipt', async ({ request }) => {
    // #given the synthetic claim the mock Nansen serves
    // #when it is stamped through the API
    const response = await request.post('/api/stamp', {
      headers: { 'x-forwarded-for': '10.0.0.4' },
      data: { ...MOCK_CLAIM, min_usd: 1100 },
    })
    const events = (await response.text())
      .trim()
      .split('\n')
      .map(
        (line) =>
          JSON.parse(line) as { type: string; receipt?: { verdict: string; origin: string } },
      )
    // #then the stream opens with the job, reports stages, and ends with a live-stamp receipt
    expect({
      type: response.headers()['content-type'],
      first: events[0]?.type,
      stages: events.some((event) => event.type === 'stage'),
      last: events.at(-1)?.type,
      verdict: events.at(-1)?.receipt?.verdict,
      origin: events.at(-1)?.receipt?.origin,
    }).toEqual({
      type: 'application/x-ndjson; charset=utf-8',
      first: 'accepted',
      stages: true,
      last: 'done',
      verdict: 'VALID',
      origin: 'live_stamp',
    })
  })

  test('Inspect shows a new stamp as LIVE STAMP and it verifies in the browser', async ({
    page,
  }) => {
    // #given a visitor with a stamp to spend
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': '10.0.0.3' })
    await page.goto('/inspect')
    // #when they enter the claim and stamp it
    await page.getByLabel('Chain', { exact: true }).selectOption(MOCK_CLAIM.chain)
    await page.getByLabel('Token', { exact: true }).fill(MOCK_CLAIM.token_address)
    await page.getByRole('option', { name: /Use this contract address/ }).click()
    await page.getByLabel('Date (UTC)', { exact: true }).fill(MOCK_CLAIM.as_of_date)
    await page.getByLabel('Claim', { exact: true }).selectOption(MOCK_CLAIM.claim_type)
    await page.getByRole('button', { name: 'Stamp', exact: true }).click()
    // #then the result is a live stamp whose integrity checks pass here
    await expect(page.getByText('LIVE STAMP', { exact: true })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Verify integrity' }).click()
    await expect(page.getByText(/Integrity verified in this browser/)).toBeVisible()
    await expect(page.getByText(/Nansen Trading supports Solana and Base only/)).toBeVisible()
  })
})
