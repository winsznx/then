import { rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { SCENARIOS, runFromScenario } from '@then/fixtures'
import { FIXTURE_SIGNING_KEY, buildReceipt } from '@then/receipt'
import { FsReceiptStore } from '@then/store'
import { EXIT } from '../config'

/**
 * Writes one receipt bundle per synthetic scenario, signed with the public fixture key. The
 * output is deterministic: same code, same bytes. CI verifies these bundles with no network.
 */
export async function fixturesCommand(flags: { out: string }): Promise<number> {
  const root = resolve(flags.out)
  await rm(root, { recursive: true, force: true })
  const store = new FsReceiptStore(root)
  const index: { scenario: string; title: string; receipt_id: string; verdict: string }[] = []
  for (const scenario of SCENARIOS) {
    const bundle = buildReceipt(runFromScenario(scenario), {
      origin: 'fixture',
      gitSha: null,
      signer: FIXTURE_SIGNING_KEY,
    })
    await store.write(bundle)
    index.push({
      scenario: scenario.id,
      title: scenario.title,
      receipt_id: bundle.receipt_id,
      verdict: bundle.public.verdict,
    })
  }
  await writeFile(resolve(root, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
  process.stdout.write(`wrote ${index.length} synthetic fixture receipts to ${root}\n`)
  return EXIT.OK
}
