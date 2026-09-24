import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { seed } from './state'

/** Contrast is measured on the settled page, not mid-fade. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  )
}

test.describe('accessibility', () => {
  const pages = () => [
    '/',
    '/inspect',
    '/challenge',
    '/challenge/archive',
    '/corpus',
    '/method',
    '/limits',
    '/about-data',
    `/r/${seed().receipts.P1.receipt_id}`,
  ]

  test('no page has a serious or critical axe violation', async ({ page }) => {
    // #given every public page
    const found: string[] = []
    // #when axe audits each one against WCAG 2.2 AA
    for (const path of pages()) {
      await page.goto(path, { waitUntil: 'networkidle' })
      await settled(page)
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      for (const violation of results.violations) {
        if (violation.impact === 'serious' || violation.impact === 'critical')
          found.push(
            `${path}: ${violation.id} (${violation.nodes.length}) ${violation.nodes[0]?.target.join(' ')}`,
          )
      }
    }
    // #then there are none
    expect(found).toEqual([])
  })

  test('the Inspect result and the Challenge reveal pass too', async ({ page }) => {
    // #given the two states that only exist after an action
    const found: string[] = []
    await page.goto('/inspect')
    await page.getByRole('button', { name: 'Load example' }).click()
    await page.getByRole('button', { name: 'Verify integrity' }).click()
    await expect(page.getByText(/Integrity verified in this browser/)).toBeVisible()
    await settled(page)
    for (const violation of (
      await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    ).violations)
      if (violation.impact === 'serious' || violation.impact === 'critical')
        found.push(`inspect: ${violation.id}`)
    await page.goto('/challenge')
    await page.getByText('VALID', { exact: true }).click()
    await page.getByRole('button', { name: /^Commit/ }).click()
    await expect(page.getByText('THEN stamped', { exact: true })).toBeVisible()
    await settled(page)
    for (const violation of (
      await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    ).violations)
      if (violation.impact === 'serious' || violation.impact === 'critical')
        found.push(`challenge reveal: ${violation.id} ${violation.nodes[0]?.target.join(' ')}`)
    // #then neither has a serious violation
    expect(found).toEqual([])
  })
})
