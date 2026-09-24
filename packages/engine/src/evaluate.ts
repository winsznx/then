import {
  dateRange,
  decide,
  fundIncluded,
  type Claim,
  type ClaimWindow,
  type DecisionInputs,
  type InternalSummary,
  type ReasonCode,
  type Settlement,
  type SideResult,
  type SourceMeasure,
  type ThresholdResult,
  type Verdict,
} from '@then/core'
import {
  CALIBRATION_TOLERANCE,
  aggregateDiagnostics,
  attributionConfirmed,
  calibrate,
  tradeAttribution,
} from './attribution'
import {
  combineSide,
  flowSummaryMeasure,
  holdingsMeasure,
  tradeMeasure,
  type HoldingsMeasure,
  type TradeMeasure,
} from './measures'
import type { Projections } from './projection'
import { computeThreshold, referencePrices } from './threshold'

export interface EngineInput {
  claim: Claim
  window: ClaimWindow
  settlement: Settlement
  ablation: boolean
  /** False when no point-in-time surface exists for this chain and claim type. */
  surface_available: boolean
  /** Why the surface is unavailable, when it is. */
  unavailable_reason?: 'UNSUPPORTED_CHAIN' | 'UNSUPPORTED_CLAIM_TYPE'
  /** Recent settled days where both cohorts nearly coincide; fixed at stamp time. */
  calibration_window: { from: string; to: string } | null
  projections: Projections
}

export interface EngineResult {
  verdict: Verdict
  reasons: ReasonCode[]
  decision_inputs: DecisionInputs
  asof: SideResult
  live: SideResult
  threshold: ThresholdResult
  summary: InternalSummary
  formulas: Record<string, string>
  /** Set when CONTAMINATED depends on a historical lookup the orchestrator has not run yet. */
  attribution_request: { wallet: string } | null
}

export const FORMULAS: Record<string, string> = {
  threshold_usd: 'max(min_usd, 0.02 × Σ volume_usd over the claim window)',
  net_flow_usd: '(Σ BUY token_amount − Σ SELL token_amount) × VWAP over the claim window',
  holdings_usd: 'Smart Money token amount on the claim date × close on the claim date',
  label_only_live_usd: 'asof_net_usd + live_only_net_usd − asof_only_net_usd',
  contamination_usd_share: 'live_only_net_usd / live_net_usd',
  contamination_wallet_share: 'live_only_wallets / live_wallets',
  drift_ratio: 'current-label measure / as-of measure',
  calibration_error: 'min over recent settled days of |current-label amount / as-of amount − 1|',
}

function toSourceMeasure(measure: TradeMeasure | HoldingsMeasure): SourceMeasure {
  const out: SourceMeasure = {
    source: measure.source,
    side: measure.side,
    role: measure.role,
    status: measure.status,
    metric: measure.metric,
    value_usd: measure.value_usd,
    support: measure.support,
    opposes: measure.opposes,
    notes: [...measure.notes],
  }
  if (measure.error) out.error = measure.error
  return out
}

const ERROR_REASONS: Record<string, ReasonCode> = {
  UPSTREAM_TIMEOUT: 'UPSTREAM_TIMEOUT',
  RATE_LIMIT: 'UPSTREAM_RATE_LIMIT',
  RATE_LIMIT_EXCEEDED: 'UPSTREAM_RATE_LIMIT',
  SCHEMA_DRIFT: 'SCHEMA_DRIFT',
}

function errorReason(measures: readonly SourceMeasure[]): ReasonCode | null {
  for (const measure of measures) {
    if (measure.role !== 'primary' || measure.status !== 'failed' || !measure.error) continue
    const code = measure.error.code.toUpperCase()
    if (ERROR_REASONS[code]) return ERROR_REASONS[code]
    if (measure.error.kind === 'rate_limit') return 'UPSTREAM_RATE_LIMIT'
    if (measure.error.kind === 'timeout' || measure.error.kind === 'aborted')
      return 'UPSTREAM_TIMEOUT'
    return 'UPSTREAM_ERROR'
  }
  return null
}

function pushUnique(list: ReasonCode[], code: ReasonCode): void {
  if (!list.includes(code)) list.push(code)
}

export function evaluate(input: EngineInput): EngineResult {
  const { claim, window, projections } = input
  const threshold = computeThreshold(claim, projections.price, window)
  const prices = referencePrices(projections.price, window)
  const isTradeClaim = claim.claim_type === 'SM_BOUGHT' || claim.claim_type === 'SM_SOLD'

  let asofMeasure: TradeMeasure | HoldingsMeasure
  let liveMeasure: TradeMeasure | HoldingsMeasure
  if (isTradeClaim) {
    asofMeasure = tradeMeasure(
      'asof_trades',
      'asof',
      projections.asof_trades,
      claim.claim_type,
      threshold.usd,
      prices.vwap,
    )
    liveMeasure = tradeMeasure(
      'live_trades',
      'live',
      projections.live_trades,
      claim.claim_type,
      threshold.usd,
      prices.vwap,
    )
  } else {
    asofMeasure = holdingsMeasure(
      'asof_snapshot',
      'asof',
      projections.asof_snapshot,
      claim.as_of_date,
      threshold.usd,
      prices.close,
    )
    liveMeasure = holdingsMeasure(
      'live_flows',
      'live',
      projections.live_flows,
      claim.as_of_date,
      threshold.usd,
      prices.close,
    )
  }

  const asofMeasures = [toSourceMeasure(asofMeasure)]
  if (isTradeClaim && projections.asof_flow_summary.status !== 'not_run') {
    asofMeasures.push(
      flowSummaryMeasure(projections.asof_flow_summary, claim.claim_type, threshold.usd),
    )
  }
  const asof = combineSide('asof', asofMeasures)
  const live = combineSide('live', [toSourceMeasure(liveMeasure)])
  const contaminationCandidate = asof.support === 'NO' && live.support === 'YES'
  const reasons: ReasonCode[] = []

  let labelDriftAttributed: boolean | null = null
  let attributionRequest: { wallet: string } | null = null
  const summary: InternalSummary = {
    wallets: null,
    aggregate: null,
    price_close_usd: prices.close,
    price_vwap_usd: prices.vwap,
  }

  if (isTradeClaim) {
    const price = prices.vwap
    const asofTrades = asofMeasure as TradeMeasure
    const liveTrades = liveMeasure as TradeMeasure
    if (price !== null && asofTrades.status === 'ok' && liveTrades.status === 'ok') {
      const attribution = tradeAttribution(
        liveTrades.wallets,
        asofTrades.wallets,
        price,
        claim,
        threshold.usd,
      )
      summary.wallets = attribution.diagnostics
      if (contaminationCandidate) {
        const wallet = attribution.top_live_only_wallet
        if (!attribution.gap_covered || wallet === null) {
          labelDriftAttributed = false
        } else if (projections.attribution === null) {
          attributionRequest = { wallet }
          labelDriftAttributed = false
        } else {
          labelDriftAttributed = attributionConfirmed(
            projections.attribution,
            wallet,
            claim.sm_label_set,
          )
        }
      }
    } else if (contaminationCandidate) {
      labelDriftAttributed = false
    }
  } else {
    const days = input.calibration_window
      ? dateRange(input.calibration_window.from, input.calibration_window.to)
      : []
    const calibration = calibrate(projections.live_flows, projections.asof_snapshot, days)
    summary.aggregate = aggregateDiagnostics(
      asofMeasure.value_usd,
      liveMeasure.value_usd,
      calibration,
    )
    if (contaminationCandidate) {
      const calibrated = calibration.error !== null && calibration.error <= CALIBRATION_TOLERANCE
      labelDriftAttributed = calibrated
      if (calibrated) pushUnique(reasons, 'ASOF_WALLET_MEMBERSHIP_UNAVAILABLE')
      else pushUnique(reasons, 'METHOD_UNCALIBRATED')
    }
  }

  const decisionInputs: DecisionInputs = {
    ablation: input.ablation,
    date_settled: input.settlement !== 'unsettled',
    surface_available: input.surface_available,
    asof_floor_met: asof.floor_met,
    asof_conflict: asof.conflict,
    asof_support: asof.support,
    live_floor_met: live.floor_met,
    live_support: live.support,
    label_drift_attributed: labelDriftAttributed,
  }
  const decision = decide(decisionInputs)

  const ordered: ReasonCode[] = []
  if (!input.surface_available && input.unavailable_reason) ordered.push(input.unavailable_reason)
  if (
    decision.reason === 'NO_HISTORICAL_SNAPSHOT' ||
    decision.reason === 'LIVE_REPLAY_UNAVAILABLE'
  ) {
    const cause = errorReason(
      decision.reason === 'NO_HISTORICAL_SNAPSHOT' ? asof.measures : live.measures,
    )
    if (cause) ordered.push(cause)
  }
  pushUnique(ordered, decision.reason)
  if (
    decision.verdict !== 'INSUFFICIENT' ||
    decision.reason === 'NEITHER_SUPPORTS' ||
    decision.reason === 'DISAGREEMENT_NOT_LABEL_DRIVEN'
  ) {
    pushUnique(
      ordered,
      asof.support === 'YES' ? 'ASOF_COHORT_SUPPORTS' : 'ASOF_COHORT_DOES_NOT_SUPPORT',
    )
    if (live.support !== 'UNKNOWN') {
      pushUnique(
        ordered,
        live.support === 'YES' ? 'LIVE_LABEL_SUPPORT' : 'LIVE_LABELS_DO_NOT_SUPPORT',
      )
    }
  }
  for (const reason of reasons) pushUnique(ordered, reason)
  if (threshold.basis === 'min_usd' && projections.price.status !== 'not_run')
    pushUnique(ordered, 'THRESHOLD_VOLUME_UNKNOWN')
  if (input.settlement === 'recent') pushUnique(ordered, 'RECENT_WINDOW')
  if (fundIncluded(claim.sm_label_set)) pushUnique(ordered, 'FUND_INCLUDED')
  for (const measure of [...asof.measures, ...live.measures]) {
    for (const note of measure.notes) {
      if (note === 'ROW_CAP' || note === 'PRICE_FALLBACK_ENDPOINT_USD') pushUnique(ordered, note)
    }
  }

  return {
    verdict: decision.verdict,
    reasons: ordered,
    decision_inputs: decisionInputs,
    asof,
    live,
    threshold,
    summary,
    formulas: FORMULAS,
    attribution_request: attributionRequest,
  }
}
