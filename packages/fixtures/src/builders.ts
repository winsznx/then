/**
 * Builders for SYNTHETIC Nansen payloads. Shapes follow the published schemas; every address,
 * amount, and label is invented. Nothing here is Nansen data.
 */
import type { SourceRecord } from '@then/engine'
import type { MeasureError, SourceId } from '@then/core'

export const TOKEN = '0x0000000000000000000000000000000000f1c7e0'
export const CHAIN = 'ethereum'

export function wallet(n: number): string {
  return `0x${n.toString(16).padStart(40, '0')}`
}

function tx(n: number): string {
  return `0x${n.toString(16).padStart(64, '0')}`
}

function page(data: unknown[]): string {
  return JSON.stringify({ data, pagination: { page: 1, per_page: 1000, is_last_page: true } })
}

export interface TradeSpec {
  trader: number
  action: 'BUY' | 'SELL'
  amount: number
  /** Endpoint USD for the trade; THEN revalues with the reference price. */
  usd?: number
  label?: string
  day: string
  n: number
}

export function liveTrades(
  trades: TradeSpec[],
  options: { truncated?: boolean } = {},
): SourceRecord {
  const rows = trades.map((t) => ({
    block_timestamp: `${t.day}T12:00:00Z`,
    transaction_hash: tx(t.n),
    trader_address: wallet(t.trader),
    trader_address_label: t.label ?? 'Smart Trader',
    action: t.action,
    token_address: TOKEN,
    token_name: 'FIXTURE',
    token_amount: t.amount,
    traded_token_address: '0x0000000000000000000000000000000000000000',
    traded_token_name: 'ETH',
    traded_token_amount: 1,
    estimated_swap_price_usd: 1,
    estimated_value_usd: t.usd ?? t.amount,
  }))
  return {
    source: 'live_trades',
    status: 'ok',
    bodies: [page(rows)],
    truncated: options.truncated ?? false,
  }
}

export function asofTrades(
  trades: TradeSpec[],
  options: { truncated?: boolean } = {},
): SourceRecord {
  const rows = trades.map((t) => ({
    block_timestamp: `${t.day}T12:00:00Z`,
    transaction_hash: tx(t.n),
    trader_address: wallet(t.trader),
    trader_address_label: t.label ?? '30D Smart Trader',
    action: t.action,
    token_name: 'FIXTURE',
    token_amount: t.amount,
    traded_token_name: 'ETH',
    traded_token_amount: 1,
    estimated_swap_price_usd: 1,
    estimated_value_usd: t.usd ?? t.amount,
  }))
  return {
    source: 'asof_trades',
    status: 'ok',
    bodies: [page(rows)],
    truncated: options.truncated ?? false,
  }
}

export interface CandleSpec {
  day: string
  close: number
  volume: number
  volume_usd: number
}

export function price(candles: CandleSpec[]): SourceRecord {
  const body = JSON.stringify({
    chain: CHAIN,
    token_address: TOKEN,
    timeframe: '1d',
    data: candles.map((c) => ({
      interval_start: `${c.day}T00:00:00Z`,
      open: c.close,
      high: c.close,
      low: c.close,
      close: c.close,
      volume: c.volume,
      volume_usd: c.volume_usd,
      market_cap: { open: null, high: null, low: null, close: null },
    })),
    truncated: false,
  })
  return { source: 'price', status: 'ok', bodies: [body], truncated: false }
}

export interface HoldingSpec {
  day: string
  amount: number
  value_usd?: number
}

export function liveFlows(points: HoldingSpec[]): SourceRecord {
  const rows = points.map((p) => ({
    date: `${p.day}T00:00:00Z`,
    bucket_end: `${p.day}T23:59:59Z`,
    is_complete: true,
    price_usd: 1,
    token_amount: p.amount,
    value_usd: p.value_usd ?? p.amount,
    holders_count: 3,
    total_inflows_count: 0,
    total_outflows_count: 0,
  }))
  return { source: 'live_flows', status: 'ok', bodies: [page(rows)], truncated: false }
}

export function asofSnapshot(points: HoldingSpec[], chain: string = CHAIN): SourceRecord {
  const rows = points.map((p) => ({
    date: p.day,
    chain,
    token_address: TOKEN,
    token_symbol: 'FIXTURE',
    token_sectors: [],
    smart_money_labels: ['Smart Trader'],
    balance: p.amount,
    value_usd: p.value_usd ?? p.amount,
    balance_24h_percent_change: 0,
    holders_count: 3,
    share_of_holdings_percent: 0,
    token_age_days: 100,
    market_cap_usd: null,
  }))
  return { source: 'asof_snapshot', status: 'ok', bodies: [page(rows)], truncated: false }
}

export function flowSummary(netFlowUsd: number | null): SourceRecord {
  const body = JSON.stringify({
    data: [
      {
        token_symbol: 'FIXTURE',
        smart_trader_net_flow_usd: netFlowUsd,
        smart_trader_wallet_count: 2,
      },
    ],
    warnings: netFlowUsd === null ? ['segment coverage does not include date_to'] : [],
  })
  return { source: 'asof_flow_summary', status: 'ok', bodies: [body], truncated: false }
}

export function attribution(
  trader: number,
  trades: { day: string; label: string | null }[],
): SourceRecord {
  const rows = trades.map((t, i) => ({
    block_timestamp: `${t.day}T12:00:00Z`,
    transaction_hash: tx(9000 + i),
    trader_address: wallet(trader),
    trader_address_label: t.label,
    action: 'BUY',
    token_name: 'FIXTURE',
    token_amount: 1,
    traded_token_name: 'ETH',
    traded_token_amount: 1,
    estimated_swap_price_usd: 1,
    estimated_value_usd: 1,
  }))
  return {
    source: 'attribution',
    status: 'ok',
    bodies: [page(rows)],
    truncated: false,
    wallet: wallet(trader),
  }
}

export function failed(source: SourceId, error: MeasureError): SourceRecord {
  return { source, status: 'failed', bodies: [], truncated: false, error }
}

export function disabled(source: SourceId): SourceRecord {
  return {
    source,
    status: 'disabled',
    bodies: [],
    truncated: false,
    error: {
      kind: 'disabled',
      code: 'SPONSOR_HISTORICAL_DISABLED',
      message: 'point-in-time surfaces are disabled',
    },
  }
}
