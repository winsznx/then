import {
  claimWindow,
  settlementOf,
  toIsoDate,
  type Claim,
  type ClaimWindow,
  type LayerRecord,
  type MeasureError,
  type Settlement,
  type SourceClass,
} from '@then/core'
import {
  evaluate,
  project,
  type EngineInput,
  type EngineResult,
  type SourceRecord,
} from '@then/engine'
import type { CapturedPayload, NansenClient, NansenError } from '@then/nansen'
import { attributionPlan, planStamp, type SourcePlan } from './plan'

export const STAMP_DEADLINE_MS = 45_000
export const MAX_PAGES = 3
export const PER_PAGE = 1000

export type StageStatus = 'waiting' | 'running' | 'done' | 'failed' | 'disabled' | 'skipped'

export interface ProgressEvent {
  stage: SourceClass
  status: StageStatus
}

export interface StampOptions {
  client: NansenClient
  now?: () => Date
  deadlineMs?: number
  maxPages?: number
  corroborate?: boolean
  onProgress?: (event: ProgressEvent) => void
}

/** Everything a receipt needs: the engine input and output plus every raw response. */
export interface StampRun {
  claim: Claim
  window: ClaimWindow
  settlement: Settlement
  engine_input: Omit<EngineInput, 'projections'>
  records: SourceRecord[]
  payloads: CapturedPayload[]
  layers: LayerRecord[]
  result: EngineResult
  credits_used: number
  started_at: string
  finished_at: string
}

function toMeasureError(error: NansenError): MeasureError {
  const out: MeasureError = { kind: error.kind, code: error.code, message: error.message }
  if (error.status !== null) out.http_status = error.status
  return out
}

function recordStatus(error: NansenError): SourceRecord['status'] {
  return error.kind === 'disabled' ? 'disabled' : 'failed'
}

interface SourceOutcome {
  record: SourceRecord
  layer: LayerRecord
  payloads: CapturedPayload[]
}

async function runSource(
  plan: SourcePlan,
  client: NansenClient,
  maxPages: number,
  signal: AbortSignal,
  extra: Partial<SourceRecord> = {},
): Promise<SourceOutcome> {
  const payloads: CapturedPayload[] = []
  const bodies: string[] = []
  let truncated = false
  let error: MeasureError | undefined
  let status: SourceRecord['status'] = 'ok'
  const pages = plan.paginated ? maxPages : 1

  for (let page = 1; page <= pages; page++) {
    const result = await client.call(plan.spec, plan.request(page), {
      signal,
      onPayload: (payload) => payloads.push(payload),
    })
    if (!result.ok) {
      status = recordStatus(result.error)
      error = toMeasureError(result.error)
      break
    }
    bodies.push(result.payload.body)
    const data = result.data as { pagination?: { is_last_page?: boolean }; data?: unknown[] }
    const last =
      !plan.paginated || data.pagination?.is_last_page !== false || (data.data?.length ?? 0) === 0
    if (last) break
    if (page === pages) truncated = true
  }

  const record: SourceRecord = {
    source: plan.source,
    status,
    bodies: status === 'ok' ? bodies : [],
    truncated,
    ...(error ? { error } : {}),
    ...extra,
  }
  const layer: LayerRecord = {
    layer: plan.layer,
    source: plan.source,
    endpoint: plan.spec.id,
    surface: plan.spec.surface,
    status: status === 'ok' ? 'ok' : status === 'disabled' ? 'disabled' : 'failed',
    payload_ids: payloads.map((payload) => payload.body_hash),
    credits_used: payloads.reduce((sum, payload) => sum + (payload.credits_used ?? 0), 0),
    ...(error ? { error } : {}),
  }
  return { record, layer, payloads }
}

function stageOf(outcomes: SourceOutcome[], stage: SourceClass, plans: SourcePlan[]): StageStatus {
  const relevant = outcomes.filter(
    (o) => plans.find((p) => p.source === o.record.source)?.stage === stage,
  )
  if (relevant.length === 0) return 'skipped'
  if (relevant.every((o) => o.record.status === 'disabled')) return 'disabled'
  return relevant.some((o) => o.record.status === 'ok') ? 'done' : 'failed'
}

/**
 * The one path from a claim to an engine verdict. Web, CLI, corpus runs, and MCP all call this;
 * none of them decides a verdict on its own.
 */
export async function runStamp(claim: Claim, options: StampOptions): Promise<StampRun> {
  const now = options.now ?? (() => new Date())
  const started = now()
  const today = toIsoDate(started)
  const window = claimWindow(claim.as_of_date, claim.window_hours)
  const settlement = settlementOf(claim.as_of_date, () => started)
  const plan = planStamp(claim, window, {
    today,
    maxPerPage: PER_PAGE,
    corroborate: options.corroborate ?? false,
  })
  const maxPages = options.maxPages ?? MAX_PAGES
  const emit = options.onProgress ?? (() => {})

  const engineBase: Omit<EngineInput, 'projections'> = {
    claim,
    window,
    settlement,
    ablation: options.client.historicalDisabled,
    surface_available: plan.surface_available,
    ...(plan.unavailable_reason ? { unavailable_reason: plan.unavailable_reason } : {}),
    calibration_window: plan.calibration_window,
  }

  const outcomes: SourceOutcome[] = []
  if (settlement !== 'unsettled' && plan.surface_available) {
    const stages = [...new Set(plan.sources.map((source) => source.stage))]
    for (const stage of stages) emit({ stage, status: 'running' })
    const deadline = AbortSignal.timeout(options.deadlineMs ?? STAMP_DEADLINE_MS)
    const settled = await Promise.all(
      plan.sources.map(async (source) => {
        const outcome = await runSource(source, options.client, maxPages, deadline)
        outcomes.push(outcome)
        const stageSources = plan.sources.filter((s) => s.stage === source.stage)
        const done = outcomes.filter((o) => stageSources.some((s) => s.source === o.record.source))
        if (done.length === stageSources.length)
          emit({ stage: source.stage, status: stageOf(outcomes, source.stage, plan.sources) })
        return outcome
      }),
    )
    outcomes.splice(0, outcomes.length, ...settled)
  }

  const records = () => outcomes.map((outcome) => outcome.record)
  const projectionContext = { window, chain: claim.chain, token_address: claim.token_address }
  let result = evaluate({ ...engineBase, projections: project(records(), projectionContext) })

  if (result.attribution_request) {
    const check = attributionPlan(claim, window, result.attribution_request.wallet)
    const deadline = AbortSignal.timeout(options.deadlineMs ?? STAMP_DEADLINE_MS)
    outcomes.push(
      await runSource(check, options.client, 1, deadline, {
        wallet: result.attribution_request.wallet,
      }),
    )
    result = evaluate({ ...engineBase, projections: project(records(), projectionContext) })
  }

  const payloads = outcomes.flatMap((outcome) => outcome.payloads)
  return {
    claim,
    window,
    settlement,
    engine_input: engineBase,
    records: records(),
    payloads,
    layers: outcomes.map((outcome) => outcome.layer),
    result,
    credits_used: payloads.reduce((sum, payload) => sum + (payload.credits_used ?? 0), 0),
    started_at: started.toISOString(),
    finished_at: now().toISOString(),
  }
}
