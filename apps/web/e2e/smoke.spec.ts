import { expect, test } from '@playwright/test'
import { MOCK_CLAIM } from './constants'
import { seed } from './state'

const WIDTHS = [390, 768, 1280, 1440]

test.describe('responsive smoke', () => {
  for (const width of WIDTHS) {
    test(`every page renders at ${width}px without sideways scroll or console errors`, async ({
      page,
    }) => {
      // #given a viewport and a record of console errors
      await page.setViewportSize({ width, height: 900 })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      const paths = [
        '/',
        '/inspect',
        '/challenge',
        '/challenge/archive',
        '/corpus',
        '/method',
        '/limits',
        '/about-data',
        '/status',
        `/r/${seed().receipts.P1.receipt_id}`,
      ]
      const overflow: string[] = []
      // #when each page loads
      for (const path of paths) {
        await page.goto(path, { waitUntil: 'networkidle' })
        const extra = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        )
        if (extra > 0) overflow.push(`${path} +${extra}px`)
      }
      // #then none scrolls sideways and none logs an error
      expect({ overflow, errors }).toEqual({ overflow: [], errors: [] })
    })
  }

  test('Inspect shows the example as a replay and clears it for a new claim @limit', async ({
    page,
  }) => {
    // #given a visitor who has used this hour's stamp, with the example loaded
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': '10.0.0.1' })
    await (
      await page.request.post('/api/stamp', {
        headers: { 'x-forwarded-for': '10.0.0.1' },
        data: { ...MOCK_CLAIM, min_usd: 1300 },
      })
    ).text()
    await page.goto('/inspect')
    await page.getByRole('button', { name: 'Load example' }).click()
    await expect(page.getByText('REPLAY', { exact: true })).toBeVisible()
    // #when another stamp is attempted
    await page.getByRole('button', { name: 'Stamp', exact: true }).click()
    // #then the old verdict is gone and the refusal names a next action
    await expect(page.getByText('No verdict was stamped')).toBeVisible()
    await expect(page.getByText('VALID', { exact: true })).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Run THEN with your own Nansen key' }),
    ).toBeVisible()
  })

  test('reduced motion leaves no running animation on the comparator', async ({ page }) => {
    // #given a visitor who prefers reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`/r/${seed().receipts.P1.receipt_id}`)
    // #then the date cut is already drawn
    const running = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.playState === 'running' &&
              (animation.effect?.getComputedTiming().duration as number) > 1,
          ).length,
    )
    expect(running).toBe(0)
  })
})
