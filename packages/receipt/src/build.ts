import {
  DISCLAIMER,
  ENGINE_VERSION,
  FUND_POLICY_VERSION,
  LABEL_ALIAS_POLICY_VERSION,
  RECEIPT_VERSION,
  asofLabelFilter,
  claimHash,
  deriveReceiptId,
  fundIncluded,
  hashBytes,
  hashCanonical,
  liveLabelFilter,
  type InternalReceipt,
  type InternalReceiptBody,
  type PublicReceipt,
  type ReceiptOrigin,
} from '@then/core'
import type { SourceRecord } from '@then/engine'
import type { StampRunLike } from './types'
import { toPublicReceipt } from './public'
import { signHash, type SigningKey } from './sign'

export const NANSEN_BASE_URL = 'https://api.nansen.ai'

/** Public receipt + private evidence. The private half never leaves the operator's storage. */
export interface ReceiptBundle {
  receipt_id: string
  public: PublicReceipt
  internal: InternalReceipt
  records: SourceRecord[]
  payloads: StampRunLike['payloads']
}

export interface BuildOptions {
  origin: ReceiptOrigin
  gitSha: string | null
  signer: SigningKey
  restampOf?: string
}

export function payloadHashesOf(records: readonly SourceRecord[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const record of records) {
    record.bodies.forEach((body, index) => {
      out[`${record.source}#${index}`] = hashBytes(body)
    })
  }
  return out
}

export function internalBodyOf(
  run: StampRunLike,
  options: Omit<BuildOptions, 'signer'>,
): InternalReceiptBody {
  const { claim, result, engine_input: input } = run
  const body: InternalReceiptBody = {
    kind: 'then.receipt.internal',
    receipt_version: RECEIPT_VERSION,
    origin: options.origin,
    generated_at: run.finished_at,
    method_version: input.method_version,
    engine_version: ENGINE_VERSION,
    then_git_sha: options.gitSha,
    claim,
    claim_hash: claimHash(claim),
    verdict: result.verdict,
    reasons: result.reasons,
    decision_inputs: result.decision_inputs,
    asof: result.asof,
    live: result.live,
    threshold: result.threshold,
    window: run.window,
    settlement: run.settlement,
    surface_available: input.surface_available,
    unavailable_reason: input.unavailable_reason ?? null,
    calibration_window: input.calibration_window,
    summary: result.summary,
    formulas: result.formulas,
    label_policy: {
      label_tier: 'tgm_filter',
      asof_label_filter: asofLabelFilter(claim.sm_label_set),
      live_label_filter: liveLabelFilter(claim.sm_label_set),
      fund_included: fundIncluded(claim.sm_label_set),
      fund_policy_version: FUND_POLICY_VERSION,
      label_alias_policy: LABEL_ALIAS_POLICY_VERSION,
    },
    layers: run.layers,
    payload_hashes: payloadHashesOf(run.records),
    snapshot_fallback_date: null,
    row_cap: 3000,
    truncated: run.records.some((record) => record.truncated),
    credits_used: run.credits_used,
    nansen_base_url: NANSEN_BASE_URL,
    disclaimer: DISCLAIMER,
  }
  if (options.restampOf) body.restamp_of = options.restampOf
  return body
}

export function signPublic(
  unsigned: Omit<PublicReceipt, 'signature'>,
  signer: SigningKey,
): PublicReceipt {
  const publicHash = hashCanonical(unsigned)
  return {
    ...unsigned,
    signature: {
      alg: 'ed25519',
      key_id: signer.key_id,
      public_hash: publicHash,
      value: signHash(publicHash, signer),
    },
  }
}

export function buildReceipt(run: StampRunLike, options: BuildOptions): ReceiptBundle {
  const body = internalBodyOf(run, options)
  const internalCommitment = hashCanonical(body)
  const receiptId = deriveReceiptId({
    claim_hash: body.claim_hash,
    generated_at: body.generated_at,
    internal_commitment: internalCommitment,
  })
  const unsigned = toPublicReceipt(receiptId, body, internalCommitment)
  return {
    receipt_id: receiptId,
    public: signPublic(unsigned, options.signer),
    internal: { receipt_id: receiptId, body },
    records: run.records,
    payloads: run.payloads,
  }
}
