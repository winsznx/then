import {
  asofLabelFilter,
  type AggregateDiagnostics,
  type Claim,
  type SmLabel,
  type WalletDiagnostics,
} from '@then/core'
import { directionOf } from './measures'
import type { AttributionProjection, HoldingsProjection } from './projection'

/** The as-of and current-label holdings series must agree this closely on some recent settled day. */
export const CALIBRATION_TOLERANCE = 0.02

export interface TradeAttribution {
  diagnostics: WalletDiagnostics
  /** Largest wallet counted only by today's labels, in the claim's direction. */
  top_live_only_wallet: string | null
  /** Live-only wallets carry enough flow to explain the gap to the threshold. */
  gap_covered: boolean
}

function valueOf(wallets: Map<string, number>, keys: Iterable<string>, price: number): number {
  let total = 0
  for (const key of keys) total += (wallets.get(key) ?? 0) * price
  return total
}

export function tradeAttribution(
  live: Map<string, number>,
  asof: Map<string, number>,
  price: number,
  claim: Claim,
  thresholdUsd: number,
): TradeAttribution {
  const direction = directionOf(claim.claim_type)
  const liveOnly = [...live.keys()].filter((wallet) => !asof.has(wallet)).sort()
  const asofOnly = [...asof.keys()].filter((wallet) => !live.has(wallet)).sort()
  const overlap = [...live.keys()].filter((wallet) => asof.has(wallet)).sort()

  const liveNet = valueOf(live, [...live.keys()].sort(), price)
  const asofNet = valueOf(asof, [...asof.keys()].sort(), price)
  const liveOnlyNet = valueOf(live, liveOnly, price)
  const asofOnlyNet = valueOf(asof, asofOnly, price)
  let overlapDelta = 0
  for (const wallet of overlap)
    overlapDelta += ((live.get(wallet) ?? 0) - (asof.get(wallet) ?? 0)) * price

  let top: string | null = null
  let topContribution = 0
  for (const wallet of liveOnly) {
    const contribution = (live.get(wallet) ?? 0) * price * direction
    if (contribution > topContribution) {
      top = wallet
      topContribution = contribution
    }
  }

  // Value overlapping wallets with the as-of data so endpoint differences cannot count as drift.
  const labelOnlyLive = (asofNet + liveOnlyNet - asofOnlyNet) * direction
  return {
    diagnostics: {
      asof_wallets: asof.size,
      live_wallets: live.size,
      overlap_wallets: overlap.length,
      live_only_wallets: liveOnly.length,
      asof_only_wallets: asofOnly.length,
      asof_net_usd: asofNet,
      live_net_usd: liveNet,
      live_only_net_usd: liveOnlyNet,
      asof_only_net_usd: asofOnlyNet,
      overlap_method_delta_usd: overlapDelta,
      contamination_wallet_share: live.size > 0 ? liveOnly.length / live.size : null,
      contamination_usd_share: liveNet !== 0 ? liveOnlyNet / liveNet : null,
    },
    top_live_only_wallet: top,
    gap_covered: labelOnlyLive >= thresholdUsd,
  }
}

/**
 * The historical lookup must show the wallet traded inside the window (so history covers it)
 * under a label outside the claim's Smart Money set (so it was not Smart Money then).
 */
export function attributionConfirmed(
  check: AttributionProjection | null,
  wallet: string,
  labels: readonly SmLabel[],
): boolean {
  if (!check || check.status !== 'ok' || check.wallet !== wallet || check.trades_in_window === 0)
    return false
  const smNames = asofLabelFilter(labels).map((name) => name.toLowerCase())
  return !check.labels_at_trade.some((label) =>
    smNames.some((name) => label.toLowerCase().includes(name)),
  )
}

function amountOn(series: HoldingsProjection, day: string): number | null {
  return series.points.find((point) => point.date === day)?.amount ?? null
}

export interface Calibration {
  error: number | null
  day: string | null
}

/**
 * Where both cohorts are nearly the same (recent settled days), the two endpoints should report
 * nearly the same holdings. If they never do, a difference on the claim date cannot be blamed on
 * label drift.
 */
export function calibrate(
  live: HoldingsProjection,
  asof: HoldingsProjection,
  days: readonly string[],
): Calibration {
  let best: Calibration = { error: null, day: null }
  if (live.status !== 'ok' || asof.status !== 'ok') return best
  for (const day of days) {
    const a = amountOn(live, day)
    const b = amountOn(asof, day)
    if (a === null || b === null || a <= 0 || b <= 0) continue
    const error = Math.abs(a / b - 1)
    if (best.error === null || error < best.error) best = { error, day }
  }
  return best
}

export function aggregateDiagnostics(
  asofValue: number | null,
  liveValue: number | null,
  calibration: Calibration,
): AggregateDiagnostics {
  return {
    asof_holdings_usd: asofValue,
    live_holdings_usd: liveValue,
    asof_delta_usd: null,
    live_delta_usd: null,
    drift_ratio:
      asofValue !== null && liveValue !== null && asofValue > 0 ? liveValue / asofValue : null,
    calibration_error: calibration.error,
    calibration_day: calibration.day,
  }
}
