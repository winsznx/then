import { parseClaim, type Claim, type PublicReceipt } from '@then/core'
import { buildReceipt } from '@then/receipt'
import { runStamp } from '@then/stamp'
import { FsReceiptStore } from '@then/store'
import {
  CliError,
  EXIT,
  gitSha,
  historicalDisabled,
  localSigningKey,
  nansenClient,
} from '../config'
import { receiptSummary } from '../print'

export interface StampFlags {
  chain: string
  token: string
  date: string
  claim: string
  windowHours?: string
  labels?: string
  minUsd?: string
  sourceUrl?: string
  sourceText?: string
  symbol?: string
  out: string
  corroborate?: boolean
  json?: boolean
  verbose?: boolean
}

export function exitCodeFor(receipt: PublicReceipt): number {
  if (receipt.decision_inputs.ablation) return EXIT.ABLATION
  return receipt.verdict === 'INSUFFICIENT' ? EXIT.INSUFFICIENT : EXIT.OK
}

export function claimFromFlags(flags: StampFlags): Claim {
  const parsed = parseClaim({
    claim_type: flags.claim,
    chain: flags.chain,
    token_address: flags.token,
    as_of_date: flags.date,
    ...(flags.symbol ? { token_symbol: flags.symbol } : {}),
    ...(flags.windowHours ? { window_hours: Number(flags.windowHours) } : {}),
    ...(flags.labels ? { sm_label_set: flags.labels.split(',').map((label) => label.trim()) } : {}),
    ...(flags.minUsd ? { min_usd: Number(flags.minUsd) } : {}),
    ...(flags.sourceUrl ? { source_url: flags.sourceUrl } : {}),
    ...(flags.sourceText ? { source_text: flags.sourceText } : {}),
  })
  if (!parsed.ok) {
    throw new CliError(
      `invalid claim: ${parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
      EXIT.CONFIG,
    )
  }
  return parsed.claim
}

export async function stampCommand(flags: StampFlags): Promise<number> {
  const claim = claimFromFlags(flags)
  const client = nansenClient({ verbose: flags.verbose ?? false })
  const run = await runStamp(claim, {
    client,
    corroborate: flags.corroborate ?? false,
    onProgress: (event) =>
      process.stderr.write(`  ${event.stage.replaceAll('_', ' ')}: ${event.status}\n`),
  })
  const auth = run.layers.find(
    (layer) => layer.error?.kind === 'auth' || layer.error?.kind === 'missing_key',
  )
  if (auth) throw new CliError('API key rejected. THEN cannot stamp.', EXIT.CONFIG)

  const bundle = buildReceipt(run, {
    origin: 'live_stamp',
    gitSha: gitSha(),
    signer: await localSigningKey(),
  })
  const store = new FsReceiptStore(flags.out)
  const dir = await store.write(bundle)
  if (flags.json) process.stdout.write(`${JSON.stringify(bundle.public, null, 2)}\n`)
  else process.stdout.write(receiptSummary(bundle.public, dir))
  if (historicalDisabled()) {
    process.stderr.write(
      'Historical Nansen surface disabled — THEN cannot stamp VALID or CONTAMINATED.\n',
    )
  }
  process.stderr.write(`credits used: ${run.credits_used}\n`)
  return exitCodeFor(bundle.public)
}
