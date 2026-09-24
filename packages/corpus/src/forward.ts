import { addDays } from '@then/core'
import { project } from '@then/engine'
import type { StampRun } from '@then/stamp'

export const FORWARD_HORIZON_DAYS = 7

/**
 * Evaluation-only outcome: close of D to close of D+7, sign-flipped for sell claims. Computed
 * from the stored price payload after the verdict exists; it never feeds the verdict.
 */
export function forwardReturn(run: StampRun): number | null {
  const projections = project(run.records, {
    window: run.window,
    chain: run.claim.chain,
    token_address: run.claim.token_address,
  })
  if (projections.price.status !== 'ok') return null
  const byDate = new Map(projections.price.candles.map((candle) => [candle.date, candle.close]))
  const entry = byDate.get(run.claim.as_of_date)
  const exit = byDate.get(addDays(run.claim.as_of_date, FORWARD_HORIZON_DAYS))
  if (!entry || !exit) return null
  const raw = exit / entry - 1
  return run.claim.claim_type === 'SM_SOLD' ? -raw : raw
}
