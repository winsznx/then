/**
 * Raw Nansen payloads → normalized projections. Pure: imports schemas only, never the HTTP
 * client, so the offline verifier can re-run it on stored bodies.
 */
import type { ClaimWindow, MeasureError, SourceId } from '@then/core'
import {
  DexTradesSchema,
  FlowSummarySchema,
  FlowsSchema,
  HistDexTradesSchema,
  OhlcvSchema,
  SmHoldingsSchema,
} from '@then/nansen/schemas'
import type { z } from 'zod'

export type ProjectionStatus = 'ok' | 'failed' | 'disabled' | 'not_run' | 'unsupported'

/** What the orchestrator stores per source and the verifier replays. */
export interface SourceRecord {
  source: SourceId
  status: ProjectionStatus
  /** Raw successful page bodies, in fetch order. */
  bodies: string[]
  truncated: boolean
  error?: MeasureError
  /** For `attribution`: the wallet that was looked up. */
  wallet?: string
}

export interface Trade {
  tx: string
  trader: string
  action: 'BUY' | 'SELL'
  token_amount: number
  value_usd: number | null
  block_time: string
  label: string | null
}

export interface TradeProjection {
  status: ProjectionStatus
  trades: Trade[]
  truncated: boolean
  /** Rows the endpoint returned outside the claim window. Dropped, counted for the record. */
  outside_window: number
  error?: MeasureError
}

export interface HoldingsPoint {
  date: string
  amount: number
  value_usd: number | null
}

export interface HoldingsProjection {
  status: ProjectionStatus
  points: HoldingsPoint[]
  error?: MeasureError
}

export interface Candle {
  date: string
  close: number | null
  volume: number | null
  volume_usd: number | null
}

export interface PriceProjection {
  status: ProjectionStatus
  candles: Candle[]
  error?: MeasureError
}

export interface FlowSummaryProjection {
  status: ProjectionStatus
  /** Null when Nansen's temporal label coverage does not reach the window end. */
  smart_trader_net_flow_usd: number | null
  warnings: string[]
  error?: MeasureError
}

export interface AttributionProjection {
  status: ProjectionStatus
  wallet: string
  trades_in_window: number
  labels_at_trade: string[]
  error?: MeasureError
}

export interface Projections {
  live_trades: TradeProjection
  asof_trades: TradeProjection
  live_flows: HoldingsProjection
  asof_snapshot: HoldingsProjection
  asof_flow_summary: FlowSummaryProjection
  price: PriceProjection
  attribution: AttributionProjection | null
}

export interface ProjectionContext {
  window: ClaimWindow
  chain: string
  token_address: string
}

const schemaDrift = (message: string): MeasureError => ({
  kind: 'schema',
  code: 'SCHEMA_DRIFT',
  message,
})

function parseBodies<S extends z.ZodType>(
  schema: S,
  bodies: readonly string[],
): { ok: true; pages: z.infer<S>[] } | { ok: false; error: MeasureError } {
  const pages: z.infer<S>[] = []
  for (const body of bodies) {
    let json: unknown
    try {
      json = JSON.parse(body)
    } catch {
      return { ok: false, error: schemaDrift('stored payload is not JSON') }
    }
    const parsed = schema.safeParse(json)
    if (!parsed.success)
      return { ok: false, error: schemaDrift(parsed.error.issues[0]?.message ?? 'invalid') }
    pages.push(parsed.data)
  }
  return { ok: true, pages }
}

function inWindow(date: string, window: ClaimWindow): boolean {
  return date >= window.from && date <= window.to
}

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const TRADE_ORDER = (a: Trade, b: Trade): number =>
  a.tx.localeCompare(b.tx) ||
  a.trader.localeCompare(b.trader) ||
  a.action.localeCompare(b.action) ||
  a.token_amount - b.token_amount

function projectTrades(
  record: SourceRecord | undefined,
  schema: typeof DexTradesSchema | typeof HistDexTradesSchema,
  context: ProjectionContext,
): TradeProjection {
  const empty: TradeProjection = {
    status: 'not_run',
    trades: [],
    truncated: false,
    outside_window: 0,
  }
  if (!record) return empty
  if (record.status !== 'ok')
    return { ...empty, status: record.status, ...(record.error ? { error: record.error } : {}) }
  const parsed = parseBodies(schema, record.bodies)
  if (!parsed.ok) return { ...empty, status: 'failed', error: parsed.error }

  const seen = new Set<string>()
  const trades: Trade[] = []
  let outside = 0
  for (const page of parsed.pages) {
    for (const row of page.data) {
      const amount = finite(row.token_amount)
      if (amount === null) continue
      const date = row.block_timestamp.slice(0, 10)
      if (!inWindow(date, context.window)) {
        outside++
        continue
      }
      const trade: Trade = {
        tx: row.transaction_hash,
        trader: row.trader_address,
        action: row.action,
        token_amount: Math.abs(amount),
        value_usd: finite(row.estimated_value_usd),
        block_time: row.block_timestamp,
        label: row.trader_address_label ?? null,
      }
      const key = `${trade.tx}|${trade.trader}|${trade.action}|${trade.token_amount}`
      if (seen.has(key)) continue
      seen.add(key)
      trades.push(trade)
    }
  }
  trades.sort(TRADE_ORDER)
  return { status: 'ok', trades, truncated: record.truncated, outside_window: outside }
}

function projectFlows(record: SourceRecord | undefined): HoldingsProjection {
  if (!record) return { status: 'not_run', points: [] }
  if (record.status !== 'ok')
    return { status: record.status, points: [], ...(record.error ? { error: record.error } : {}) }
  const parsed = parseBodies(FlowsSchema, record.bodies)
  if (!parsed.ok) return { status: 'failed', points: [], error: parsed.error }
  const byDate = new Map<string, HoldingsPoint>()
  for (const page of parsed.pages) {
    for (const row of page.data) {
      const amount = finite(row.token_amount)
      if (amount === null) continue
      byDate.set(row.date.slice(0, 10), {
        date: row.date.slice(0, 10),
        amount,
        value_usd: finite(row.value_usd),
      })
    }
  }
  return { status: 'ok', points: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) }
}

function projectSnapshot(
  record: SourceRecord | undefined,
  context: ProjectionContext,
): HoldingsProjection {
  if (!record) return { status: 'not_run', points: [] }
  if (record.status !== 'ok')
    return { status: record.status, points: [], ...(record.error ? { error: record.error } : {}) }
  const parsed = parseBodies(SmHoldingsSchema, record.bodies)
  if (!parsed.ok) return { status: 'failed', points: [], error: parsed.error }
  const token = context.token_address.toLowerCase()
  const byDate = new Map<string, HoldingsPoint>()
  for (const page of parsed.pages) {
    for (const row of page.data) {
      if (row.token_address.toLowerCase() !== token || row.chain !== context.chain) continue
      const amount = finite(row.balance)
      if (amount === null) continue
      const previous = byDate.get(row.date)
      const value = finite(row.value_usd)
      byDate.set(row.date, {
        date: row.date,
        amount: (previous?.amount ?? 0) + amount,
        value_usd: previous ? (previous.value_usd ?? 0) + (value ?? 0) : value,
      })
    }
  }
  return { status: 'ok', points: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) }
}

function projectPrice(record: SourceRecord | undefined): PriceProjection {
  if (!record) return { status: 'not_run', candles: [] }
  if (record.status !== 'ok')
    return { status: record.status, candles: [], ...(record.error ? { error: record.error } : {}) }
  const parsed = parseBodies(OhlcvSchema, record.bodies)
  if (!parsed.ok) return { status: 'failed', candles: [], error: parsed.error }
  const byDate = new Map<string, Candle>()
  for (const page of parsed.pages) {
    for (const candle of page.data) {
      const date = candle.interval_start.slice(0, 10)
      byDate.set(date, {
        date,
        close: finite(candle.close),
        volume: finite(candle.volume),
        volume_usd: finite(candle.volume_usd),
      })
    }
  }
  return {
    status: 'ok',
    candles: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
  }
}

function projectFlowSummary(record: SourceRecord | undefined): FlowSummaryProjection {
  const empty: FlowSummaryProjection = {
    status: 'not_run',
    smart_trader_net_flow_usd: null,
    warnings: [],
  }
  if (!record) return empty
  if (record.status !== 'ok')
    return { ...empty, status: record.status, ...(record.error ? { error: record.error } : {}) }
  const parsed = parseBodies(FlowSummarySchema, record.bodies)
  if (!parsed.ok) return { ...empty, status: 'failed', error: parsed.error }
  const page = parsed.pages[0]
  return {
    status: 'ok',
    smart_trader_net_flow_usd: finite(page?.data[0]?.smart_trader_net_flow_usd),
    warnings: page?.warnings ?? [],
  }
}

function projectAttribution(
  record: SourceRecord | undefined,
  context: ProjectionContext,
): AttributionProjection | null {
  if (!record) return null
  const wallet = record.wallet ?? ''
  if (record.status !== 'ok') {
    return {
      status: record.status,
      wallet,
      trades_in_window: 0,
      labels_at_trade: [],
      ...(record.error ? { error: record.error } : {}),
    }
  }
  const parsed = parseBodies(HistDexTradesSchema, record.bodies)
  if (!parsed.ok)
    return {
      status: 'failed',
      wallet,
      trades_in_window: 0,
      labels_at_trade: [],
      error: parsed.error,
    }
  let count = 0
  const labels = new Set<string>()
  for (const page of parsed.pages) {
    for (const row of page.data) {
      if (
        row.trader_address !== wallet ||
        !inWindow(row.block_timestamp.slice(0, 10), context.window)
      )
        continue
      count++
      if (row.trader_address_label) labels.add(row.trader_address_label)
    }
  }
  return { status: 'ok', wallet, trades_in_window: count, labels_at_trade: [...labels].sort() }
}

export function project(records: readonly SourceRecord[], context: ProjectionContext): Projections {
  const bySource = new Map(records.map((record) => [record.source, record]))
  return {
    live_trades: projectTrades(bySource.get('live_trades'), DexTradesSchema, context),
    asof_trades: projectTrades(bySource.get('asof_trades'), HistDexTradesSchema, context),
    live_flows: projectFlows(bySource.get('live_flows')),
    asof_snapshot: projectSnapshot(bySource.get('asof_snapshot'), context),
    asof_flow_summary: projectFlowSummary(bySource.get('asof_flow_summary')),
    price: projectPrice(bySource.get('price')),
    attribution: projectAttribution(bySource.get('attribution'), context),
  }
}
