/**
 * Independent re-implementation of THEN's support rules and verdict table. It shares only the
 * projection types with the production engine and recomputes everything else from the rules as
 * written, so a bug in one implementation shows up as a disagreement in tests.
 */
import type { Claim, ClaimWindow, SupportState, Verdict } from '@then/core'
import type { EngineInput, Projections, Trade } from '@then/engine'

export interface ReferenceResult {
  verdict: Verdict
  asof_support: SupportState
  live_support: SupportState
  threshold_usd: number
  asof_value_usd: number | null
  live_value_usd: number | null
}

const DAY = 86_400_000

function days(window: ClaimWindow): string[] {
  const out: string[] = []
  for (
    let t = Date.parse(`${window.from}T00:00:00Z`);
    t <= Date.parse(`${window.to}T00:00:00Z`);
    t += DAY
  ) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

/** Methods where flow claims are judged against the claim's own floor instead of volume. */
const FLOOR_FOR_FLOWS = new Set(['2026-09-24.2'])

function threshold(claim: Claim, p: Projections, window: ClaimWindow, method: string): number {
  if (claim.claim_type !== 'SM_HOLDS' && FLOOR_FOR_FLOWS.has(method)) return claim.min_usd
  if (p.price.status !== 'ok' || p.price.candles.length === 0) return claim.min_usd
  const wanted = new Set(days(window))
  const inWindow = p.price.candles.filter((c) => wanted.has(c.date))
  if (inWindow.some((c) => c.volume_usd === null)) return claim.min_usd
  const volume = inWindow.reduce((acc, c) => acc + (c.volume_usd ?? 0), 0)
  return Math.max(claim.min_usd, volume * 0.02)
}

function vwap(p: Projections, window: ClaimWindow): number | null {
  if (p.price.status !== 'ok') return null
  const wanted = new Set(days(window))
  const rows = p.price.candles.filter(
    (c) => wanted.has(c.date) && (c.volume ?? 0) > 0 && c.volume_usd,
  )
  const tokens = rows.reduce((acc, c) => acc + (c.volume ?? 0), 0)
  const usd = rows.reduce((acc, c) => acc + (c.volume_usd ?? 0), 0)
  const close = p.price.candles.find((c) => c.date === window.to)?.close ?? null
  const value = tokens > 0 ? usd / tokens : close
  return value && value > 0 ? value : null
}

function closeOn(p: Projections, day: string): number | null {
  if (p.price.status !== 'ok') return null
  return p.price.candles.find((c) => c.date === day)?.close ?? null
}

function tradeValue(trades: readonly Trade[], price: number | null): number | null {
  if (price !== null) {
    return (
      trades.reduce((acc, t) => acc + (t.action === 'BUY' ? 1 : -1) * t.token_amount, 0) * price
    )
  }
  if (trades.some((t) => t.value_usd === null)) return null
  return trades.reduce((acc, t) => acc + (t.action === 'BUY' ? 1 : -1) * (t.value_usd ?? 0), 0)
}

type Side = { known: boolean; value: number | null }

function tradeSide(p: Projections['live_trades'], price: number | null): Side {
  if (p.status !== 'ok' || p.truncated) return { known: false, value: null }
  const value = tradeValue(p.trades, price)
  return { known: value !== null, value }
}

function holdingSide(p: Projections['live_flows'], day: string, close: number | null): Side {
  if (p.status !== 'ok' || p.points.length === 0) return { known: false, value: null }
  const point = p.points.find((x) => x.date === day)
  const value = close !== null ? (point?.amount ?? 0) * close : point ? point.value_usd : 0
  return { known: value !== null, value }
}

function supportOf(side: Side, thresholdUsd: number, direction: number): SupportState {
  if (!side.known || side.value === null) return 'UNKNOWN'
  return side.value * direction >= thresholdUsd ? 'YES' : 'NO'
}

/**
 * Verdict table, written out row by row.
 * ablation → I; unsettled → I; no surface → I; as-of unknown → I; as-of conflict → I;
 * as-of YES → V; as-of NO & live YES & attributed → C; everything else → I.
 */
function verdictTable(input: {
  ablation: boolean
  settled: boolean
  surface: boolean
  asof: SupportState
  asofConflict: boolean
  live: SupportState
  attributed: boolean | null
}): Verdict {
  const rows: [boolean, Verdict][] = [
    [input.ablation, 'INSUFFICIENT'],
    [!input.settled, 'INSUFFICIENT'],
    [!input.surface, 'INSUFFICIENT'],
    [input.asofConflict, 'INSUFFICIENT'],
    [input.asof === 'UNKNOWN', 'INSUFFICIENT'],
    [input.asof === 'YES', 'VALID'],
    [input.live === 'YES' && input.attributed === true, 'CONTAMINATED'],
  ]
  return rows.find(([matches]) => matches)?.[1] ?? 'INSUFFICIENT'
}

/**
 * The reference does not re-derive attribution: it checks the verdict table given the
 * production engine's attribution flag, which the fixtures assert independently.
 */
export function referenceEvaluate(input: EngineInput, attributed: boolean | null): ReferenceResult {
  const { claim, window, projections: p } = input
  const t = threshold(claim, p, window, input.method_version)
  const direction = claim.claim_type === 'SM_SOLD' ? -1 : 1
  const isTrade = claim.claim_type === 'SM_BOUGHT' || claim.claim_type === 'SM_SOLD'
  const asofSide = isTrade
    ? tradeSide(p.asof_trades, vwap(p, window))
    : holdingSide(p.asof_snapshot, claim.as_of_date, closeOn(p, window.to))
  const liveSide = isTrade
    ? tradeSide(p.live_trades, vwap(p, window))
    : holdingSide(p.live_flows, claim.as_of_date, closeOn(p, window.to))
  const primaryAsof = supportOf(asofSide, t, isTrade ? direction : 1)
  const live = supportOf(liveSide, t, isTrade ? direction : 1)
  const summaryFlow =
    p.asof_flow_summary.status === 'ok' ? p.asof_flow_summary.smart_trader_net_flow_usd : null
  const asofConflict =
    isTrade && primaryAsof === 'YES' && summaryFlow !== null && summaryFlow * direction <= -t
  // Sources pointing in opposite directions leave the side undecided.
  const asof: SupportState = asofConflict ? 'UNKNOWN' : primaryAsof
  return {
    verdict: verdictTable({
      ablation: input.ablation,
      settled: input.settlement !== 'unsettled',
      surface: input.surface_available,
      asof,
      asofConflict,
      live,
      attributed,
    }),
    asof_support: asof,
    live_support: live,
    threshold_usd: t,
    asof_value_usd: asofSide.value,
    live_value_usd: liveSide.value,
  }
}
