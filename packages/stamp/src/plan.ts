import {
  CHAIN_COVERAGE,
  addDays,
  asofLabelFilter,
  liveLabelFilter,
  minDate,
  type Claim,
  type ClaimWindow,
  type SourceClass,
  type SourceId,
} from '@then/core'
import { ENDPOINTS, type EndpointSpec } from '@then/nansen'

export interface SourcePlan {
  source: SourceId
  /** Internal layer ids, kept for developer detail. */
  layer: string
  stage: SourceClass
  spec: EndpointSpec
  /** Request for a given page (1-based). */
  request: (page: number) => object
  paginated: boolean
}

export interface StampPlan {
  surface_available: boolean
  unavailable_reason?: 'UNSUPPORTED_CHAIN' | 'UNSUPPORTED_CLAIM_TYPE'
  calibration_window: { from: string; to: string } | null
  sources: SourcePlan[]
}

export interface PlanOptions {
  today: string
  maxPerPage: number
  /** Add the Smart Trader flow summary as a corroborating as-of source (5 credits). */
  corroborate: boolean
}

const DAILY_RANGE_MIN_DAYS = 8

/**
 * Which Nansen calls a claim needs. Every as-of request ends on the claim date; nothing asks
 * point-in-time endpoints about a later day.
 */
export function planStamp(claim: Claim, window: ClaimWindow, options: PlanOptions): StampPlan {
  const coverage = CHAIN_COVERAGE[claim.chain]
  const token = claim.token_address
  const priceTo = minDate(addDays(claim.as_of_date, 7), addDays(options.today, -1))
  const price: SourcePlan = {
    source: 'price',
    layer: 'L6',
    stage: 'dated_activity',
    spec: ENDPOINTS.tokenOhlcv,
    paginated: false,
    request: () => ({
      chain: claim.chain,
      token_address: token,
      date: { from: addDays(window.from, -1), to: priceTo },
      timeframe: '1d',
    }),
  }

  if (claim.claim_type === 'SM_PERP') {
    return {
      surface_available: false,
      unavailable_reason: 'UNSUPPORTED_CLAIM_TYPE',
      calibration_window: null,
      sources: [],
    }
  }

  if (claim.claim_type === 'SM_BOUGHT' || claim.claim_type === 'SM_SOLD') {
    if (!coverage.wallet_history) {
      return {
        surface_available: false,
        unavailable_reason: 'UNSUPPORTED_CHAIN',
        calibration_window: null,
        sources: [],
      }
    }
    const perPage = options.maxPerPage
    const sources: SourcePlan[] = [
      {
        source: 'asof_trades',
        layer: 'L2+L4',
        stage: 'historical_cohort',
        spec: ENDPOINTS.histDexTrades,
        paginated: true,
        request: (page) => ({
          chain: claim.chain,
          token_address: token,
          date_range: { from: window.from, to: window.to },
          filters: { include_labels: asofLabelFilter(claim.sm_label_set) },
          pagination: { page, per_page: perPage },
          order_by: [{ field: 'block_timestamp', direction: 'ASC' }],
        }),
      },
      {
        source: 'live_trades',
        layer: 'L3',
        stage: 'current_label_replay',
        spec: ENDPOINTS.dexTrades,
        paginated: true,
        request: (page) => ({
          chain: claim.chain,
          token_address: token,
          date: { from: window.from, to: window.to },
          filters: { include_smart_money_labels: liveLabelFilter(claim.sm_label_set) },
          pagination: { page, per_page: perPage },
          order_by: [{ field: 'block_timestamp', direction: 'ASC' }],
        }),
      },
      price,
    ]
    if (options.corroborate) {
      sources.push({
        source: 'asof_flow_summary',
        layer: 'L1',
        stage: 'historical_cohort',
        spec: ENDPOINTS.histFlowSummary,
        paginated: false,
        request: () => ({
          chain: claim.chain,
          token_address: token,
          date_range: { from: window.from, to: window.to },
        }),
      })
    }
    return { surface_available: true, calibration_window: null, sources }
  }

  if (!coverage.sm_snapshot) {
    return {
      surface_available: false,
      unavailable_reason: 'UNSUPPORTED_CHAIN',
      calibration_window: null,
      sources: [],
    }
  }
  // Recent settled days where today's cohort and each day's cohort nearly coincide.
  const calibration = { from: addDays(options.today, -8), to: addDays(options.today, -2) }
  const seriesEnd = calibration.to > claim.as_of_date ? calibration.to : claim.as_of_date
  const flowsFrom = addDays(claim.as_of_date, -DAILY_RANGE_MIN_DAYS)
  return {
    surface_available: true,
    calibration_window: calibration,
    sources: [
      {
        source: 'asof_snapshot',
        layer: 'L1',
        stage: 'historical_cohort',
        spec: ENDPOINTS.smHistoricalHoldings,
        paginated: true,
        request: (page) => ({
          date_range: { from: addDays(window.from, -1), to: seriesEnd },
          chains: [claim.chain],
          filters: {
            token_address: token,
            include_smart_money_labels: asofLabelFilter(claim.sm_label_set),
          },
          pagination: { page, per_page: 1000 },
        }),
      },
      {
        source: 'live_flows',
        layer: 'L3',
        stage: 'current_label_replay',
        spec: ENDPOINTS.flows,
        paginated: true,
        request: (page) => ({
          chain: claim.chain,
          token_address: token,
          date: { from: flowsFrom, to: seriesEnd },
          label: 'smart_money',
          pagination: { page, per_page: 1000 },
        }),
      },
      price,
    ],
  }
}

export function attributionPlan(claim: Claim, window: ClaimWindow, wallet: string): SourcePlan {
  return {
    source: 'attribution',
    layer: 'L4-check',
    stage: 'historical_cohort',
    spec: ENDPOINTS.histDexTrades,
    paginated: false,
    request: () => ({
      chain: claim.chain,
      token_address: claim.token_address,
      date_range: { from: window.from, to: window.to },
      filters: { trader_address: wallet },
      pagination: { page: 1, per_page: 100 },
    }),
  }
}
