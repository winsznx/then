import { dateRange, type Claim, type ClaimWindow, type ThresholdResult } from '@then/core'
import type { Candle, PriceProjection } from './projection'

export const VOLUME_SHARE = 0.02
export const THRESHOLD_RULE = 'max(min_usd, 0.02 × DEX volume over the claim window)'

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

export function computeThreshold(
  claim: Claim,
  price: PriceProjection,
  window: ClaimWindow,
): ThresholdResult {
  const volume = windowVolumeUsd(price, window)
  if (volume === null) {
    return { usd: claim.min_usd, basis: 'min_usd', volume_usd: null, rule: THRESHOLD_RULE }
  }
  return {
    usd: Math.max(claim.min_usd, VOLUME_SHARE * volume),
    basis: 'volume',
    volume_usd: volume,
    rule: THRESHOLD_RULE,
  }
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
