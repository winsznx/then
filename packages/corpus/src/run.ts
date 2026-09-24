import {
  parseClaim,
  type Claim,
  type ReasonCode,
  type SupportState,
  type Verdict,
} from '@then/core'
import { ENDPOINTS, type NansenClient } from '@then/nansen'
import { runStamp, type StampRun } from '@then/stamp'
import { isSupportedChain, type CorpusClaim } from './claims'
import { forwardReturn } from './forward'
import { resolveToken } from './resolve'

export type NotRunReason =
  | 'BUDGET'
  | 'UNSUPPORTED_CHAIN_NAME'
  | 'TOKEN_AMBIGUOUS'
  | 'TOKEN_NOT_FOUND'
  | 'TOKEN_LOOKUP_FAILED'
  | 'INVALID_CLAIM'

export interface CorpusRow {
  claim_id: string
  source_url: string
  quote: string
  chain: string
  token_symbol: string
  token_address: string
  as_of_date: string
  claim_type: string
  window_hours: number
  selection_role: string
  status: 'stamped' | 'not_run'
  not_run_reason: NotRunReason | null
  verdict: Verdict | null
  reasons: ReasonCode[]
  asof_support: SupportState
  live_support: SupportState
  asof_recoverable: boolean
  live_recoverable: boolean
  disagreement: boolean | null
  verdict_changing: boolean | null
  /** Private: the two primary measures in USD and their ratio. Never published. */
  asof_value_usd: number | null
  live_value_usd: number | null
  drift_ratio: number | null
  /** Measures differ by 25% or more (zero against non-zero counts as drift). */
  drifted: boolean | null
  /** Evaluation only. Never an input to the verdict. */
  forward_return_7d: number | null
  credits_used: number
}

export interface CorpusRunOptions {
  client: NansenClient
  now?: () => Date
  /** Credits to leave untouched in the account. */
  reserveCredits: number
  /** Expected credits for one claim, before the conditional attribution lookup. */
  estimateCredits: (claim: Claim) => number
  corroborate?: boolean
  onRow: (row: CorpusRow, run: StampRun | null) => Promise<void>
  log?: (message: string) => void
}

const ATTRIBUTION_RESERVE = 5

export function estimateCredits(claim: Claim): number {
  if (claim.claim_type === 'SM_HOLDS') return 3
  if (claim.claim_type === 'SM_PERP') return 0
  return 7
}

function emptyRow(claim: CorpusClaim): CorpusRow {
  return {
    claim_id: claim.claim_id,
    source_url: claim.source_url,
    quote: claim.quote,
    chain: claim.chain,
    token_symbol: claim.token_symbol,
    token_address: claim.token_address,
    as_of_date: claim.as_of_date,
    claim_type: claim.claim_type,
    window_hours: claim.window_hours,
    selection_role: claim.selection_role,
    status: 'not_run',
    not_run_reason: null,
    verdict: null,
    reasons: [],
    asof_support: 'UNKNOWN',
    live_support: 'UNKNOWN',
    asof_recoverable: false,
    live_recoverable: false,
    disagreement: null,
    verdict_changing: null,
    asof_value_usd: null,
    live_value_usd: null,
    drift_ratio: null,
    drifted: null,
    forward_return_7d: null,
    credits_used: 0,
  }
}

function primaryValue(measures: StampRun['result']['asof']['measures']): number | null {
  const primary = measures.find((measure) => measure.role === 'primary' && measure.status === 'ok')
  return primary?.value_usd ?? null
}

export function rowFromRun(claim: CorpusClaim, run: StampRun): CorpusRow {
  const { result } = run
  const asof = result.asof.support
  const live = result.live.support
  const known = asof !== 'UNKNOWN' && live !== 'UNKNOWN'
  const asofValue = primaryValue(result.asof.measures)
  const liveValue = primaryValue(result.live.measures)
  const bothValued = asofValue !== null && liveValue !== null
  let drifted: boolean | null = null
  if (bothValued) {
    drifted = asofValue === 0 ? liveValue !== 0 : Math.abs(liveValue / asofValue - 1) >= 0.25
  }
  return {
    ...emptyRow(claim),
    token_address: run.claim.token_address,
    status: 'stamped',
    verdict: result.verdict,
    reasons: result.reasons,
    asof_support: asof,
    live_support: live,
    asof_recoverable: result.asof.floor_met,
    live_recoverable: result.live.floor_met,
    disagreement: known ? asof !== live : null,
    verdict_changing: known
      ? result.verdict === 'CONTAMINATED' || (result.verdict === 'VALID' && live === 'NO')
      : null,
    asof_value_usd: asofValue,
    live_value_usd: liveValue,
    drift_ratio: bothValued && asofValue !== 0 ? liveValue / asofValue : null,
    drifted,
    forward_return_7d: forwardReturn(run),
    credits_used: run.credits_used,
  }
}

/**
 * Runs claims strictly in file order. Before each claim it checks the account balance (free)
 * and stops once the next claim could push spending into the reserve; every remaining claim is
 * recorded as not run for budget, never dropped.
 */
export async function runCorpus(
  claims: readonly CorpusClaim[],
  options: CorpusRunOptions,
): Promise<CorpusRow[]> {
  const rows: CorpusRow[] = []
  const log = options.log ?? (() => {})
  let outOfBudget = false

  for (const corpusClaim of claims) {
    const row = emptyRow(corpusClaim)
    if (outOfBudget) {
      rows.push({ ...row, not_run_reason: 'BUDGET' })
      await options.onRow({ ...row, not_run_reason: 'BUDGET' }, null)
      continue
    }
    if (!isSupportedChain(corpusClaim.chain)) {
      const skipped = { ...row, not_run_reason: 'UNSUPPORTED_CHAIN_NAME' as const }
      rows.push(skipped)
      await options.onRow(skipped, null)
      continue
    }

    const resolution = await resolveToken(
      options.client,
      corpusClaim.chain,
      corpusClaim.token_symbol,
      corpusClaim.token_address,
    )
    if (resolution.status !== 'resolved') {
      const reason: NotRunReason =
        resolution.status === 'ambiguous'
          ? 'TOKEN_AMBIGUOUS'
          : resolution.status === 'lookup_failed'
            ? 'TOKEN_LOOKUP_FAILED'
            : resolution.status === 'invalid_address'
              ? 'INVALID_CLAIM'
              : 'TOKEN_NOT_FOUND'
      const skipped = { ...row, not_run_reason: reason }
      rows.push(skipped)
      await options.onRow(skipped, null)
      log(`${corpusClaim.claim_id}: not run (${reason})`)
      continue
    }

    const parsed = parseClaim({
      claim_type: corpusClaim.claim_type,
      chain: corpusClaim.chain,
      token_address: resolution.address,
      token_symbol: corpusClaim.token_symbol.replace(/^\$/, '').slice(0, 32) || undefined,
      as_of_date: corpusClaim.as_of_date,
      window_hours: corpusClaim.window_hours,
      source_url: corpusClaim.source_url,
      source_text: corpusClaim.quote.slice(0, 2000),
    })
    if (!parsed.ok) {
      const skipped = { ...row, not_run_reason: 'INVALID_CLAIM' as const }
      rows.push(skipped)
      await options.onRow(skipped, null)
      log(`${corpusClaim.claim_id}: invalid claim ${JSON.stringify(parsed.issues)}`)
      continue
    }

    const account = await options.client.call(ENDPOINTS.account, undefined)
    const remaining = account.ok ? account.data.credits_remaining : 0
    const needed =
      options.estimateCredits(parsed.claim) +
      (parsed.claim.claim_type === 'SM_HOLDS' ? 0 : ATTRIBUTION_RESERVE)
    if (remaining - needed < options.reserveCredits) {
      outOfBudget = true
      rows.push({ ...row, not_run_reason: 'BUDGET' })
      await options.onRow({ ...row, not_run_reason: 'BUDGET' }, null)
      log(
        `${corpusClaim.claim_id}: stop, ${remaining} credits left, needs up to ${needed}, reserve ${options.reserveCredits}`,
      )
      continue
    }

    const run = await runStamp(parsed.claim, {
      client: options.client,
      ...(options.now ? { now: options.now } : {}),
      corroborate: options.corroborate ?? false,
    })
    const stamped = rowFromRun(corpusClaim, run)
    rows.push(stamped)
    await options.onRow(stamped, run)
    log(
      `${corpusClaim.claim_id}: ${stamped.verdict} (as-of ${stamped.asof_support}, today ${stamped.live_support}) credits ${run.credits_used}`,
    )
  }
  return rows
}
