import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { claimFromReceipt, createCase } from '@then/challenge'
import { SCENARIOS, runFromScenario } from '@then/fixtures'
import { buildReceipt, signingKeyFromSeed } from '@then/receipt'
import { ThenRepository, migrate, pgliteDb } from '@then/store'
import { LOCAL_PUBLIC_KEY, LOCAL_SEED, STATE_DIR } from './constants'

/**
 * A throwaway database for the e2e run: three synthetic receipts (one per verdict) signed with a
 * test key the server is told to trust, a Challenge case for each, and one featured receipt.
 * Nothing here is published anywhere.
 */
/** Before the run, so no seeded receipt falls inside the ten-minute reuse window. */
const STAMPED_AT = '2026-06-20T00:00:00.000Z'

async function main(): Promise<void> {
  const state = resolve(STATE_DIR)
  await rm(state, { recursive: true, force: true })
  await mkdir(state, { recursive: true })
  const db = await pgliteDb(resolve(state, 'pglite'))
  await migrate(db)
  const repo = new ThenRepository(db)
  const signer = signingKeyFromSeed(LOCAL_SEED, 'local')
  if (signer.public_key_hex !== LOCAL_PUBLIC_KEY)
    throw new Error('LOCAL_PUBLIC_KEY does not match LOCAL_SEED')
  const receipts: Record<string, { receipt_id: string; verdict: string }> = {}
  for (const id of ['P1', 'P2', 'P3']) {
    const scenario = SCENARIOS.find((s) => s.id === id)!
    const bundle = buildReceipt(runFromScenario(scenario, STAMPED_AT), {
      origin: 'live_stamp',
      gitSha: null,
      signer,
    })
    await repo.putReceipt(bundle)
    await repo.putCase(
      createCase(
        bundle.public,
        claimFromReceipt(bundle.public, { quote: `End-to-end case ${id}` }),
        {
          now: '2026-01-01T00:00:00.000Z',
        },
      ),
    )
    receipts[id] = { receipt_id: bundle.receipt_id, verdict: bundle.public.verdict }
  }
  await repo.setFeatured(receipts.P2!.receipt_id)
  await db.close()
  await writeFile(
    resolve(state, 'seed.json'),
    JSON.stringify({ receipts, local_public_key: signer.public_key_hex }),
  )
  process.stdout.write(`e2e seed: ${Object.keys(receipts).length} receipts\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(
    `e2e seed failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  )
  process.exitCode = 1
})
