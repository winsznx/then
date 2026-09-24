import { expect, test } from '@playwright/test'
import { seed } from './state'

test.describe('Challenge', () => {
  test('holds no answer before the guess and reveals the receipt verdict after it', async ({
    page,
  }) => {
    // #given the Daily page
    const receiptIds = Object.values(seed().receipts).map((receipt) => receipt.receipt_id)
    const pre = await (await page.goto('/challenge'))!.text()
    // #then the page carries no verdict field and no receipt id
    expect({
      verdictFields: /"verdict":"(VALID|CONTAMINATED|INSUFFICIENT)"/.test(pre),
      receiptIds: receiptIds.filter((id) => pre.includes(id)),
    }).toEqual({ verdictFields: false, receiptIds: [] })

    // #when a guess is committed
    await page.getByText('INSUFFICIENT', { exact: true }).click()
    await page.getByRole('button', { name: /^Commit/ }).click()

    // #then the reveal shows THEN's stamp and opens the commitment
    await expect(page.getByText('THEN stamped', { exact: true })).toBeVisible()
    await expect(page.getByText(/The answer was fixed before you chose/)).toBeVisible()
  })

  test('keeps the first answer when a second guess is sent', async ({ page }) => {
    // #given a committed answer on today's case
    await page.goto('/challenge')
    await page.getByText('VALID', { exact: true }).click()
    await page.getByRole('button', { name: /^Commit/ }).click()
    await expect(page.getByText('THEN stamped', { exact: true })).toBeVisible()
    // #when a different guess is posted for the same case from the same browser
    const again = await page.evaluate(async () => {
      const archive = await (await fetch('/api/challenge/archive')).json()
      const played = archive.cases.find((row: { played: unknown }) => row.played !== null)
      const response = await fetch(`/api/challenge/${played.challenge_id}/guess`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ guess: 'CONTAMINATED' }),
      })
      return response.json()
    })

    // #then the stored answer is still the first one
    expect({ repeat: again.already_committed, guess: again.reveal.guess }).toEqual({
      repeat: true,
      guess: 'VALID',
    })
  })
})
