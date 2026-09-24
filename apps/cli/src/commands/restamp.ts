import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseClaim } from '@then/core'
import { buildReceipt, compareReceipts, type DriftReport } from '@then/receipt'
import { runStamp } from '@then/stamp'
import { FsReceiptStore, locateReceipt } from '@then/store'
import { CliError, EXIT, gitSha, localSigningKey, nansenClient } from '../config'
import { receiptSummary } from '../print'
import { exitCodeFor } from './stamp'

export function driftText(drift: DriftReport): string {
  const changed = drift.sources.filter((source) => source.changed).map((source) => source.source)
  return [
    `  drift vs ${drift.original_receipt_id}`,
    `    verdict   ${drift.verdict.original} → ${drift.verdict.restamp}${drift.verdict.changed ? '  (changed)' : ''}`,
    `    as-of     ${drift.asof_support.original} → ${drift.asof_support.restamp}`,
    `    today     ${drift.live_support.original} → ${drift.live_support.restamp}`,
    `    method    ${drift.method.original} → ${drift.method.restamp}${drift.method.changed ? '  (changed: a difference can come from the rule, not the data)' : ''}`,
    `    sources   ${changed.length === 0 ? 'all unchanged' : `restated: ${changed.join(', ')}`}`,
    '',
  ].join('\n')
}

/**
 * Stamps the same claim again as a new receipt. The original is read, never written; the drift
 * report sits beside the new receipt as drift.json.
 */
export async function restampCommand(
  target: string,
  flags: { root: string; out?: string; verbose?: boolean },
): Promise<number> {
  const located = locateReceipt(target, flags.root)
  if (!located)
    throw new CliError(`not a receipt id or a path inside a receipt bundle: ${target}`, EXIT.CONFIG)
  const original = await new FsReceiptStore(located.root).readPrivate(located.receiptId)
  const parsed = parseClaim(original.internal.body.claim)
  if (!parsed.ok) throw new CliError('the stored claim no longer parses', EXIT.CONFIG)

  const run = await runStamp(parsed.claim, {
    client: nansenClient({ verbose: flags.verbose ?? false }),
  })
  if (
    run.layers.some((layer) => layer.error?.kind === 'auth' || layer.error?.kind === 'missing_key')
  )
    throw new CliError('API key rejected. THEN cannot stamp.', EXIT.CONFIG)
  const bundle = buildReceipt(run, {
    origin: 'restamp',
    gitSha: gitSha(),
    signer: await localSigningKey(),
    restampOf: located.receiptId,
  })
  const dir = await new FsReceiptStore(flags.out ?? located.root).write(bundle)
  const drift = compareReceipts(original.internal, bundle.internal)
  await writeFile(join(dir, 'drift.json'), `${JSON.stringify(drift, null, 2)}\n`)
  process.stdout.write(receiptSummary(bundle.public, dir))
  process.stdout.write(driftText(drift))
  process.stderr.write(`credits used: ${run.credits_used}\n`)
  return exitCodeFor(bundle.public)
}
