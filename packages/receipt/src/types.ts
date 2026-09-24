/**
 * Structural copies of the orchestrator's run types. The receipt package (and therefore the
 * verifier) must not import the Nansen HTTP client, so it depends on shapes, not on @then/stamp.
 */
import type { Claim, ClaimWindow, LayerRecord, Settlement } from '@then/core'
import type { EngineInput, EngineResult, SourceRecord } from '@then/engine'

export interface CapturedPayloadLike {
  endpoint: string
  method: string
  path: string
  surface: string
  request: unknown
  request_hash: string
  status: number
  body: string
  body_hash: string
  fetched_at: string
  latency_ms: number
  attempt: number
  credits_cost: number | null
  credits_used: number | null
  credits_remaining: number | null
  request_id: string | null
}

export interface StampRunLike {
  claim: Claim
  window: ClaimWindow
  settlement: Settlement
  engine_input: Omit<EngineInput, 'projections'>
  records: SourceRecord[]
  payloads: CapturedPayloadLike[]
  layers: LayerRecord[]
  result: EngineResult
  credits_used: number
  started_at: string
  finished_at: string
}
