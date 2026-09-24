import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { ENDPOINTS } from '@then/nansen'
import {
  estimateCredits,
  parseCorpus,
  runCorpus,
  s0Markdown,
  summarizeS0,
  type CorpusRow,
} from '@then/corpus'
import { buildReceipt, redistributionFindings } from '@then/receipt'
import { FsReceiptStore } from '@then/store'
import { CliError, EXIT, gitSha, localSigningKey, nansenClient } from '../config'

export interface CorpusFlags {
  claims: string
  out: string
  limit?: string
  reserve: string
  s0?: string
  corroborate?: boolean
  verbose?: boolean
}

async function readRows(path: string): Promise<CorpusRow[]> {
  if (!existsSync(path)) return []
  return (await readFile(path, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CorpusRow)
}

/**
 * Runs the frozen corpus in file order. Rows already stamped in <out>/rows.jsonl are reused, so
 * an interrupted run never pays for the same claim twice.
 */
export async function corpusRunCommand(flags: CorpusFlags): Promise<number> {
  const text = await readFile(flags.claims, 'utf8').catch(() => {
    throw new CliError(`cannot read claims file ${flags.claims}`, EXIT.CONFIG)
  })
  const { claims, invalid } = parseCorpus(text)
  if (invalid.length) {
    throw new CliError(
      `claims file has invalid lines: ${invalid.map((i) => `line ${i.line}: ${i.error}`).join('; ')}`,
      EXIT.CONFIG,
    )
  }
  const selected = flags.limit ? claims.slice(0, Number(flags.limit)) : claims
  const out = resolve(flags.out)
  const rowsPath = join(out, 'rows.jsonl')
  await mkdir(out, { recursive: true })

  const previous = await readRows(rowsPath)
  const done = new Map(
    previous.filter((row) => row.status === 'stamped').map((row) => [row.claim_id, row]),
  )
  const pending = selected.filter((claim) => !done.has(claim.claim_id))

  const client = nansenClient({ verbose: flags.verbose ?? false })
  const before = await client.call(ENDPOINTS.account, undefined)
  if (!before.ok) throw new CliError(`account check failed: ${before.error.message}`, EXIT.CONFIG)
  process.stderr.write(
    `plan ${before.data.plan}, ${before.data.credits_remaining} credits; ${pending.length} claims to run, ${done.size} reused\n`,
  )

  const store = new FsReceiptStore(join(out, 'receipts'))
  const signer = await localSigningKey()
  const publicFindings: string[] = []
  const fresh: CorpusRow[] = []
  await writeFile(
    rowsPath,
    previous
      .filter((row) => row.status === 'stamped')
      .map((row) => JSON.stringify(row))
      .join('\n') + (done.size ? '\n' : ''),
  )

  await runCorpus(pending, {
    client,
    reserveCredits: Number(flags.reserve),
    estimateCredits,
    corroborate: flags.corroborate ?? false,
    log: (message) => process.stderr.write(`${message}\n`),
    onRow: async (row, run) => {
      let stored = row
      if (run) {
        const bundle = buildReceipt(run, { origin: 'live_stamp', gitSha: gitSha(), signer })
        await store.write(bundle)
        publicFindings.push(
          ...redistributionFindings(bundle.public, bundle).map(
            (finding) => `${row.claim_id}: ${finding}`,
          ),
        )
        stored = { ...row, receipt_id: bundle.receipt_id } as CorpusRow & { receipt_id: string }
      }
      fresh.push(stored)
      await appendFile(rowsPath, `${JSON.stringify(stored)}\n`)
    },
  })

  const after = await client.call(ENDPOINTS.account, undefined)
  const creditsUsed =
    before.ok && after.ok ? before.data.credits_remaining - after.data.credits_remaining : 0
  const byId = new Map([...done.values(), ...fresh].map((row) => [row.claim_id, row]))
  const rows = selected
    .map((claim) => byId.get(claim.claim_id))
    .filter((row): row is CorpusRow => row !== undefined)

  const stamped = rows.filter((row) => row.status === 'stamped').length
  const publicSafe = publicFindings.length > 0 ? 'FAIL' : stamped > 0 ? 'PASS' : 'PARTIAL'
  const summary = summarizeS0(rows, publicSafe)
  await writeFile(
    join(out, 'summary.json'),
    `${JSON.stringify({ summary, public_findings: publicFindings, credits_used: creditsUsed }, null, 2)}\n`,
  )
  if (flags.s0) {
    await writeFile(
      resolve(flags.s0),
      s0Markdown(summary, rows, {
        generated_at: new Date().toISOString(),
        credits_used: creditsUsed,
      }),
    )
    process.stderr.write(`S0 summary written to ${flags.s0}\n`)
  }
  process.stdout.write(
    `claims ${summary.claims_tested}, stamped ${summary.claims_stamped}, complete ${summary.complete_dual}, disagreements ${summary.support_disagreements}/${summary.complete_dual}, decision ${summary.decision} (${summary.decision_basis}); credits used ${creditsUsed}\n`,
  )
  return EXIT.OK
}
