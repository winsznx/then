import type {
  ClaimType,
  MeasureStatus,
  SideResult,
  SourceId,
  SourceMeasure,
  SupportState,
} from '@then/core'
import type {
  FlowSummaryProjection,
  HoldingsProjection,
  ProjectionStatus,
  Trade,
  TradeProjection,
} from './projection'

export function directionOf(claimType: ClaimType): 1 | -1 {
  return claimType === 'SM_SOLD' ? -1 : 1
}

function measureStatus(status: ProjectionStatus): MeasureStatus {
  return status
}

/** Net token flow per wallet: buys positive, sells negative. Sorted for deterministic sums. */
export function netTokensByWallet(trades: readonly Trade[]): Map<string, number> {
  const byWallet = new Map<string, number>()
  for (const trade of trades) {
    const signed = trade.action === 'BUY' ? trade.token_amount : -trade.token_amount
    byWallet.set(trade.trader, (byWallet.get(trade.trader) ?? 0) + signed)
  }
  return new Map([...byWallet.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function sum(values: Iterable<number>): number {
  let total = 0
  for (const value of values) total += value
  return total
}

/** Endpoint USD, used only when no reference price exists. */
function endpointNetUsd(trades: readonly Trade[]): number | null {
  let total = 0
  for (const trade of trades) {
    if (trade.value_usd === null) return null
    total += trade.action === 'BUY' ? trade.value_usd : -trade.value_usd
  }
  return total
}

export interface TradeMeasure extends SourceMeasure {
  net_tokens: number | null
  wallets: Map<string, number>
}

export function tradeMeasure(
  source: SourceId,
  side: 'asof' | 'live',
  projection: TradeProjection,
  claimType: ClaimType,
  thresholdUsd: number,
  price: number | null,
): TradeMeasure {
  const base = {
    source,
    side,
    role: 'primary' as const,
    metric: 'net_flow_usd' as const,
    notes: [] as string[],
  }
  if (projection.status !== 'ok') {
    return {
      ...base,
      status: measureStatus(projection.status),
      value_usd: null,
      support: 'UNKNOWN',
      opposes: false,
      net_tokens: null,
      wallets: new Map(),
      ...(projection.error ? { error: projection.error } : {}),
    }
  }
  const wallets = netTokensByWallet(projection.trades)
  const netTokens = sum(wallets.values())
  let valueUsd: number | null
  if (price !== null) {
    valueUsd = netTokens * price
  } else {
    valueUsd = endpointNetUsd(projection.trades)
    base.notes.push('PRICE_FALLBACK_ENDPOINT_USD')
  }
  // A capped source is a partial sum: the rows past the cap could move it either way.
  if (projection.truncated) base.notes.push('ROW_CAP')
  if (valueUsd === null || projection.truncated) {
    return {
      ...base,
      status: 'ok',
      value_usd: null,
      support: 'UNKNOWN',
      opposes: false,
      net_tokens: netTokens,
      wallets,
    }
  }
  const signed = valueUsd * directionOf(claimType)
  return {
    ...base,
    status: 'ok',
    value_usd: valueUsd,
    support: signed >= thresholdUsd ? 'YES' : 'NO',
    opposes: signed <= -thresholdUsd,
    net_tokens: netTokens,
    wallets,
  }
}

export interface HoldingsMeasure extends SourceMeasure {
  amount: number | null
}

/**
 * Holdings on the claim date, valued at that day's close. A missing row inside a non-empty
 * series means the cohort held none; an empty series is unknown, never zero.
 */
export function holdingsMeasure(
  source: SourceId,
  side: 'asof' | 'live',
  projection: HoldingsProjection,
  asOfDate: string,
  thresholdUsd: number,
  close: number | null,
): HoldingsMeasure {
  const base = {
    source,
    side,
    role: 'primary' as const,
    metric: 'holdings_usd' as const,
    notes: [] as string[],
  }
  if (projection.status !== 'ok') {
    return {
      ...base,
      status: measureStatus(projection.status),
      value_usd: null,
      support: 'UNKNOWN',
      opposes: false,
      amount: null,
      ...(projection.error ? { error: projection.error } : {}),
    }
  }
  if (projection.points.length === 0) {
    return {
      ...base,
      status: 'empty',
      value_usd: null,
      support: 'UNKNOWN',
      opposes: false,
      amount: null,
    }
  }
  const point = projection.points.find((p) => p.date === asOfDate)
  const amount = point?.amount ?? 0
  let valueUsd: number | null
  if (close !== null) {
    valueUsd = amount * close
  } else {
    valueUsd = point ? point.value_usd : 0
    base.notes.push('PRICE_FALLBACK_ENDPOINT_USD')
  }
  if (valueUsd === null) {
    return { ...base, status: 'ok', value_usd: null, support: 'UNKNOWN', opposes: false, amount }
  }
  return {
    ...base,
    status: 'ok',
    value_usd: valueUsd,
    support: valueUsd >= thresholdUsd ? 'YES' : 'NO',
    opposes: false,
    amount,
  }
}

/**
 * Smart Trader net flow resolved at the window end. It has no current-label counterpart for past
 * windows, so it never creates support; it only flags a conflict when it crosses the threshold in
 * the opposite direction.
 */
export function flowSummaryMeasure(
  projection: FlowSummaryProjection,
  claimType: ClaimType,
  thresholdUsd: number,
): SourceMeasure {
  const base = {
    source: 'asof_flow_summary' as const,
    side: 'asof' as const,
    role: 'corroborating' as const,
    metric: 'net_flow_usd' as const,
    notes: [] as string[],
  }
  if (projection.status !== 'ok') {
    return {
      ...base,
      status: measureStatus(projection.status),
      value_usd: null,
      support: 'UNKNOWN',
      opposes: false,
      ...(projection.error ? { error: projection.error } : {}),
    }
  }
  const value = projection.smart_trader_net_flow_usd
  if (value === null) {
    return { ...base, status: 'empty', value_usd: null, support: 'UNKNOWN', opposes: false }
  }
  const signed = value * directionOf(claimType)
  return {
    ...base,
    status: 'ok',
    value_usd: value,
    support: signed >= thresholdUsd ? 'YES' : 'NO',
    opposes: signed <= -thresholdUsd,
  }
}

/**
 * A side supports the claim when a primary source meets the threshold in the claim's direction
 * and no source crosses it in the opposite direction. Opposite crossings are a conflict.
 */
export function combineSide(side: 'asof' | 'live', measures: SourceMeasure[]): SideResult {
  const usable = measures.filter((m) => m.status === 'ok' && m.support !== 'UNKNOWN')
  const floorMet = usable.some((m) => m.role === 'primary')
  const supports = usable.some((m) => m.role === 'primary' && m.support === 'YES')
  const conflict = supports && usable.some((m) => m.opposes)
  let support: SupportState = 'UNKNOWN'
  if (floorMet && !conflict) support = supports ? 'YES' : 'NO'
  return { side, floor_met: floorMet, conflict, support, measures }
}
