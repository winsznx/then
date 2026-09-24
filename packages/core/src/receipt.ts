import { z } from 'zod'
import { CLAIM_TYPES } from './claim'
import { CHAINS } from './chains'
import { SM_LABELS } from './labels'
import {
  REASON_CODES,
  SUPPORT_STATES,
  VERDICTS,
  type ReasonCode,
  type SupportState,
  type Verdict,
} from './verdict'
import type { DecisionInputs } from './decide'
import type { Claim, PublicClaim } from './claim'

export const RECEIPT_VERSION = '1.0.0'
export const ENGINE_VERSION = '1.0.0'
/** Version of the published method: reconstructions, support rules, verdict rule. */
export const METHOD_VERSION = '2026-09-24'

/** How the receipt came to exist. Display modes (LIVE STAMP / REPLAY) are decided by the renderer. */
export const RECEIPT_ORIGINS = ['live_stamp', 'restamp', 'fixture'] as const
export type ReceiptOrigin = (typeof RECEIPT_ORIGINS)[number]

/** The three public reconstruction stages, in the order Inspect shows them. */
export const SOURCE_CLASSES = [
  'historical_cohort',
  'dated_activity',
  'current_label_replay',
] as const
export type SourceClass = (typeof SOURCE_CLASSES)[number]

export const SOURCE_STATUSES = [
  'complete',
  'partial',
  'unavailable',
  'disabled',
  'not_run',
] as const
export type SourceStatus = (typeof SOURCE_STATUSES)[number]

export const THRESHOLD_BASES = ['volume', 'min_usd'] as const

/**
 * Internal source ids. Each maps to one Nansen endpoint family and one side of the comparison.
 * `*_trades`: DEX trades by Smart Money wallets (live: today's labels; asof: labels at trade date).
 * `live_flows` / `asof_snapshot`: Smart Money holdings of the token (today's cohort vs each day's cohort).
 * `asof_flow_summary`: Smart Trader net flow resolved at the window end; corroborates only.
 * `attribution`: one historical trade lookup for the largest wallet that only today's labels count.
 */
export const SOURCE_IDS = [
  'live_trades',
  'asof_trades',
  'live_flows',
  'asof_snapshot',
  'asof_flow_summary',
  'price',
  'attribution',
] as const
export type SourceId = (typeof SOURCE_IDS)[number]

const supportState = z.enum(SUPPORT_STATES)
const sha256Ref = z.string().regex(/^sha256:[0-9a-f]{64}$/)

export const DecisionInputsSchema = z.strictObject({
  ablation: z.boolean(),
  date_settled: z.boolean(),
  surface_available: z.boolean(),
  asof_floor_met: z.boolean(),
  asof_conflict: z.boolean(),
  asof_support: supportState,
  live_floor_met: z.boolean(),
  live_support: supportState,
  label_drift_attributed: z.boolean().nullable(),
}) satisfies z.ZodType<DecisionInputs>

export const PublicClaimSchema = z.strictObject({
  claim_type: z.enum(CLAIM_TYPES),
  chain: z.enum(CHAINS),
  token_address: z.string().min(1),
  token_symbol: z.string().optional(),
  as_of_date: z.iso.date(),
  window_hours: z.number().int(),
  sm_label_set: z.array(z.enum(SM_LABELS)),
  min_usd: z.number(),
  quote_asset: z.literal('USD'),
  source_url: z.string().optional(),
  source_text_sha256: sha256Ref.optional(),
}) satisfies z.ZodType<PublicClaim>

/**
 * The shareable layer. Nothing here can reconstruct Nansen's Smart Money membership:
 * no wallet addresses, wallet counts, Smart Money balances, or per-wallet labels.
 */
export const PublicReceiptSchema = z.strictObject({
  kind: z.literal('then.receipt.public'),
  receipt_version: z.literal(RECEIPT_VERSION),
  receipt_id: z.string(),
  origin: z.enum(RECEIPT_ORIGINS),
  generated_at: z.iso.datetime(),
  method_version: z.string(),
  engine_version: z.string(),
  claim: PublicClaimSchema,
  claim_hash: sha256Ref,
  verdict: z.enum(VERDICTS),
  reasons: z.array(z.enum(REASON_CODES as [ReasonCode, ...ReasonCode[]])),
  decision_inputs: DecisionInputsSchema,
  comparison: z.strictObject({
    live_label_replay_support: supportState,
    asof_support: supportState,
    difference: z.enum(['MATERIAL', 'NONE', 'UNKNOWN']),
    public_explanation: z.string(),
  }),
  evidence: z.strictObject({
    historical_cutoff: z.iso.date(),
    window: z.strictObject({ from: z.iso.date(), to: z.iso.date() }),
    threshold: z.strictObject({
      usd: z.number(),
      basis: z.enum(THRESHOLD_BASES),
      rule: z.string(),
    }),
    sources: z.array(
      z.strictObject({
        class: z.enum(SOURCE_CLASSES),
        status: z.enum(SOURCE_STATUSES),
      }),
    ),
    settlement: z.enum(['settled', 'recent', 'unsettled']),
    powered_by: z.literal('Nansen API'),
  }),
  commitments: z.strictObject({
    claim_hash: sha256Ref,
    internal_commitment: sha256Ref,
    payload_root: sha256Ref,
    payload_count: z.number().int().nonnegative(),
    source_hashes: z.array(sha256Ref),
  }),
  restamp_of: z.string().optional(),
  restatement_notice: z.string(),
  disclaimer: z.string(),
  signature: z
    .strictObject({
      alg: z.literal('ed25519'),
      key_id: z.string(),
      public_hash: sha256Ref,
      value: z.string(),
    })
    .optional(),
})
export type PublicReceipt = z.infer<typeof PublicReceiptSchema>
export type UnsignedPublicReceipt = Omit<PublicReceipt, 'signature'>

export interface ThresholdResult {
  usd: number
  basis: 'volume' | 'min_usd'
  volume_usd: number | null
  rule: string
}

export type MeasureStatus = 'ok' | 'empty' | 'failed' | 'disabled' | 'not_run' | 'unsupported'
export type MeasureMetric = 'net_flow_usd' | 'holdings_usd' | 'holdings_delta_usd'

export interface MeasureError {
  kind: string
  code: string
  message: string
  http_status?: number
}

/** One source's contribution to one side of the comparison. Private. */
export interface SourceMeasure {
  source: SourceId
  side: 'asof' | 'live'
  role: 'primary' | 'corroborating'
  status: MeasureStatus
  metric: MeasureMetric
  value_usd: number | null
  support: SupportState
  opposes: boolean
  error?: MeasureError
  notes: string[]
}

export interface SideResult {
  side: 'asof' | 'live'
  floor_met: boolean
  conflict: boolean
  support: SupportState
  measures: SourceMeasure[]
}

/** Wallet-level diagnostics. Private: this is reverse-engineerable Smart Money membership. */
export interface WalletDiagnostics {
  asof_wallets: number
  live_wallets: number
  overlap_wallets: number
  live_only_wallets: number
  asof_only_wallets: number
  asof_net_usd: number
  live_net_usd: number
  live_only_net_usd: number
  asof_only_net_usd: number
  overlap_method_delta_usd: number
  contamination_wallet_share: number | null
  contamination_usd_share: number | null
}

export interface AggregateDiagnostics {
  asof_holdings_usd: number | null
  live_holdings_usd: number | null
  asof_delta_usd: number | null
  live_delta_usd: number | null
  drift_ratio: number | null
  calibration_error: number | null
  calibration_day: string | null
}

export interface InternalSummary {
  wallets: WalletDiagnostics | null
  aggregate: AggregateDiagnostics | null
  price_close_usd: number | null
  price_vwap_usd: number | null
}

export interface LayerRecord {
  layer: string
  source: SourceId
  endpoint: string
  surface: 'asof' | 'live' | 'meta'
  status: 'ok' | 'empty' | 'failed' | 'disabled' | 'cached'
  payload_ids: string[]
  credits_used: number
  error?: MeasureError
}

export interface LabelPolicy {
  label_tier: 'tgm_filter' | 'premium'
  asof_label_filter: string[]
  live_label_filter: string[]
  fund_included: boolean
  fund_policy_version: string
  label_alias_policy: string
}

/** The private, full receipt. Its canonical hash is the public `internal_commitment`. */
export interface InternalReceiptBody {
  kind: 'then.receipt.internal'
  receipt_version: string
  origin: ReceiptOrigin
  generated_at: string
  method_version: string
  engine_version: string
  then_git_sha: string | null
  claim: Claim
  claim_hash: string
  verdict: Verdict
  reasons: ReasonCode[]
  decision_inputs: DecisionInputs
  asof: SideResult
  live: SideResult
  threshold: ThresholdResult
  window: { from: string; to: string; days: number }
  settlement: 'settled' | 'recent' | 'unsettled'
  surface_available: boolean
  unavailable_reason: 'UNSUPPORTED_CHAIN' | 'UNSUPPORTED_CLAIM_TYPE' | null
  /** Recent settled days used to check that the holdings pair agrees; fixed at stamp time. */
  calibration_window: { from: string; to: string } | null
  summary: InternalSummary
  formulas: Record<string, string>
  label_policy: LabelPolicy
  layers: LayerRecord[]
  payload_hashes: Record<string, string>
  snapshot_fallback_date: string | null
  row_cap: number
  truncated: boolean
  credits_used: number
  nansen_base_url: string
  restamp_of?: string
  disclaimer: string
}

export interface InternalReceipt {
  receipt_id: string
  body: InternalReceiptBody
}

export type { SupportState, Verdict }
