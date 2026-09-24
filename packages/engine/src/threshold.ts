import { dateRange, type Claim, type ClaimWindow, type ThresholdResult } from '@then/core'
import type { Candle, PriceProjection } from './projection'

export const VOLUME_SHARE = 0.02

type ThresholdRule = 'volume_share' | 'min_usd'

const RULE_TEXT: Record<ThresholdRule, string> = {
  volume_share: 'max(min_usd, 0.02 × DEX volume over the claim window)',
  min_usd: 'min_usd in the claimed direction',
}

/**
 * Support thresholds per published method version. Receipts replay under the version they were
 * stamped with, so old receipts keep verifying after a rule changes.
 *
 * 2026-09-24.2: flow claims are judged against the claim's own materiality floor. Comparing one
 * cohort's net flow with the token's gross volume made true public buy claims on liquid tokens
 * unconfirmable (see METHOD.md). Holdings keep the volume-relative threshold.
 */
export const METHOD_RULES = {
  '2026-09-24': { flow: 'volume_share', holds: 'volume_share' },
  '2026-09-24.2': { flow: 'min_usd', holds: 'volume_share' },
} as const satisfies Record<string, { flow: ThresholdRule; holds: ThresholdRule }>

export type MethodVersion = keyof typeof METHOD_RULES

export const CURRENT_METHOD: MethodVersion = '2026-09-24.2'

export function isMethodVersion(value: string): value is MethodVersion {
  return value in METHOD_RULES
}

function candlesByDate(price: PriceProjection): Map<string, Candle> {
  return new Map(price.candles.map((candle) => [candle.date, candle]))
}

/**
 * Window DEX volume. A day with no candle inside a successful response had no trades, so it
 * counts as zero; with no candles at all the token is not priced and volume is unknown.
 */
export function windowVolumeUsd(price: PriceProjection, window: ClaimWindow): number | null {
  if (price.status !== 'ok' || price.candles.length === 0) return null
  const byDate = candlesByDate(price)
  let total = 0
  for (const day of dateRange(window.from, window.to)) {
    const candle = byDate.get(day)
    if (!candle) continue
    if (candle.volume_usd === null) return null
    total += candle.volume_usd
  }
  return total
}

export function thresholdRuleFor(claim: Claim, method: MethodVersion): ThresholdRule {
  return claim.claim_type === 'SM_HOLDS' ? METHOD_RULES[method].holds : METHOD_RULES[method].flow
}

export function computeThreshold(
  claim: Claim,
  price: PriceProjection,
  window: ClaimWindow,
  method: MethodVersion = CURRENT_METHOD,
): ThresholdResult {
  const rule = thresholdRuleFor(claim, method)
  const volume = windowVolumeUsd(price, window)
  if (rule === 'min_usd') {
    return { usd: claim.min_usd, basis: 'min_usd', volume_usd: volume, rule: RULE_TEXT.min_usd }
  }
  if (volume === null) {
    return { usd: claim.min_usd, basis: 'min_usd', volume_usd: null, rule: RULE_TEXT.volume_share }
  }
  return {
    usd: Math.max(claim.min_usd, VOLUME_SHARE * volume),
    basis: 'volume',
    volume_usd: volume,
    rule: RULE_TEXT.volume_share,
  }
}

/** True when a volume-relative rule had to fall back to the minimum because volume was unknown. */
export function volumeFallback(threshold: ThresholdResult): boolean {
  return threshold.rule === RULE_TEXT.volume_share && threshold.volume_usd === null
}

export interface ReferencePrices {
  /** Close of the claim date: values holdings. */
  close: number | null
  /** Volume-weighted price over the window: values trade flow. Falls back to the close. */
  vwap: number | null
}

export function referencePrices(price: PriceProjection, window: ClaimWindow): ReferencePrices {
  if (price.status !== 'ok') return { close: null, vwap: null }
  const byDate = candlesByDate(price)
  const close = byDate.get(window.to)?.close ?? null
  let usd = 0
  let tokens = 0
  for (const day of dateRange(window.from, window.to)) {
    const candle = byDate.get(day)
    if (candle?.volume_usd && candle.volume && candle.volume > 0) {
      usd += candle.volume_usd
      tokens += candle.volume
    }
  }
  const vwap = tokens > 0 ? usd / tokens : close
  return { close, vwap: vwap !== null && Number.isFinite(vwap) && vwap > 0 ? vwap : null }
}
