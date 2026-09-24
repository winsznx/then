import { claimWindow, hashBytes, hashCanonical, type LayerRecord } from '@then/core'
import { evaluate, project } from '@then/engine'
import { FIXTURE_NOW, type Scenario } from './scenarios'

const ENDPOINT_OF: Record<string, { id: string; path: string; surface: 'asof' | 'live' | 'meta' }> =
  {
    live_trades: { id: 'tgm.dex_trades', path: '/api/v1/tgm/dex-trades', surface: 'live' },
    asof_trades: {
      id: 'hist.dex_trades',
      path: '/api/v1beta1/tgm/historical-dex-trades',
      surface: 'asof',
    },
    live_flows: { id: 'tgm.flows', path: '/api/v1/tgm/flows', surface: 'live' },
    asof_snapshot: {
      id: 'sm.historical_holdings',
      path: '/api/v1/smart-money/historical-holdings',
      surface: 'asof',
    },
    asof_flow_summary: {
      id: 'hist.flow_summary',
      path: '/api/v1beta1/tgm/historical-token-flow-summary',
      surface: 'asof',
    },
    price: { id: 'tgm.token_ohlcv', path: '/api/v1/tgm/token-ohlcv', surface: 'meta' },
    attribution: {
      id: 'hist.dex_trades',
      path: '/api/v1beta1/tgm/historical-dex-trades',
      surface: 'asof',
    },
  }

/** A complete stamp run built from a SYNTHETIC scenario, as the orchestrator would produce it. */
export function runFromScenario(scenario: Scenario, now: string = FIXTURE_NOW) {
  const window = claimWindow(scenario.claim.as_of_date, scenario.claim.window_hours)
  const engineInput = {
    method_version: scenario.method_version,
    claim: scenario.claim,
    window,
    settlement: scenario.settlement,
    ablation: scenario.ablation,
    surface_available: scenario.surface_available,
    ...(scenario.unavailable_reason ? { unavailable_reason: scenario.unavailable_reason } : {}),
    calibration_window: scenario.calibration_window,
  }
  const projections = project(scenario.records, {
    window,
    chain: scenario.claim.chain,
    token_address: scenario.claim.token_address,
  })
  const result = evaluate({ ...engineInput, projections })

  const payloads = scenario.records.flatMap((record) =>
    record.bodies.map((body, index) => {
      const endpoint = ENDPOINT_OF[record.source]!
      return {
        endpoint: endpoint.id,
        method: 'POST',
        path: endpoint.path,
        surface: endpoint.surface,
        request: { fixture: record.source, page: index + 1 },
        request_hash: hashCanonical({ fixture: record.source, page: index + 1 }),
        status: 200,
        body,
        body_hash: hashBytes(body),
        fetched_at: now,
        latency_ms: 0,
        attempt: 1,
        credits_cost: 0,
        credits_used: 0,
        credits_remaining: null,
        request_id: null,
      }
    }),
  )
  const layers: LayerRecord[] = scenario.records.map((record) => {
    const endpoint = ENDPOINT_OF[record.source]!
    const layer: LayerRecord = {
      layer: record.source,
      source: record.source,
      endpoint: endpoint.id,
      surface: endpoint.surface,
      status: record.status === 'ok' ? 'ok' : record.status === 'disabled' ? 'disabled' : 'failed',
      payload_ids: record.bodies.map((body) => hashBytes(body)),
      credits_used: 0,
    }
    if (record.error) layer.error = record.error
    return layer
  })
  return {
    claim: scenario.claim,
    window,
    settlement: scenario.settlement,
    engine_input: engineInput,
    records: scenario.records,
    payloads,
    layers,
    result,
    credits_used: 0,
    started_at: now,
    finished_at: now,
  }
}
