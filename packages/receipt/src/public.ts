import {
  DISCLAIMER,
  REASONS,
  RECEIPT_VERSION,
  RESTATEMENT_NOTICE,
  differenceOf,
  hashSet,
  isPublicReason,
  publicClaimOf,
  type InternalReceiptBody,
  type LayerRecord,
  type ReasonCode,
  type SourceClass,
  type SourceStatus,
  type UnsignedPublicReceipt,
} from '@then/core'

const STAGE_SOURCES: Record<SourceClass, string[]> = {
  historical_cohort: ['asof_trades', 'asof_snapshot'],
  dated_activity: ['price'],
  current_label_replay: ['live_trades', 'live_flows'],
}

function stageStatus(
  layers: readonly LayerRecord[],
  stage: SourceClass,
  truncated: boolean,
): SourceStatus {
  const relevant = layers.filter((layer) => STAGE_SOURCES[stage].includes(layer.source))
  if (relevant.length === 0) return 'not_run'
  if (relevant.every((layer) => layer.status === 'disabled')) return 'disabled'
  if (relevant.some((layer) => layer.status === 'ok' || layer.status === 'cached')) {
    return truncated ? 'partial' : 'complete'
  }
  return 'unavailable'
}

/** One plain sentence under the verdict. Never a number that could reveal Smart Money flow. */
export function publicExplanation(
  body: Pick<InternalReceiptBody, 'verdict' | 'reasons' | 'claim' | 'decision_inputs'>,
): string {
  const date = body.claim.as_of_date
  switch (body.verdict) {
    case 'VALID':
      return body.decision_inputs.live_support === 'NO'
        ? `The cohort Nansen recognized as Smart Money on ${date} supports this claim. Today's labels would miss it.`
        : `The cohort Nansen recognized as Smart Money on ${date} supports this claim.`
    case 'CONTAMINATED':
      return `Today's labels support this claim. The cohort Nansen recognized on ${date} does not.`
    default: {
      const primary = body.reasons.find(isPublicReason)
      return primary ? REASONS[primary].text : REASONS.NO_HISTORICAL_SNAPSHOT.text
    }
  }
}

export function sourceHashesOf(body: Pick<InternalReceiptBody, 'payload_hashes'>): string[] {
  return [...new Set(Object.values(body.payload_hashes))].sort()
}

/**
 * The shareable projection of an internal receipt. Only the claim, support states, verdict,
 * public reasons, rule parameters, timestamps, and hashes cross this line.
 */
export function toPublicReceipt(
  receiptId: string,
  body: InternalReceiptBody,
  internalCommitment: string,
): UnsignedPublicReceipt {
  const sourceHashes = sourceHashesOf(body)
  const reasons = body.reasons.filter(isPublicReason) as ReasonCode[]
  const out: UnsignedPublicReceipt = {
    kind: 'then.receipt.public',
    receipt_version: RECEIPT_VERSION,
    receipt_id: receiptId,
    origin: body.origin,
    generated_at: body.generated_at,
    method_version: body.method_version,
    engine_version: body.engine_version,
    claim: publicClaimOf(body.claim),
    claim_hash: body.claim_hash,
    verdict: body.verdict,
    reasons,
    decision_inputs: body.decision_inputs,
    comparison: {
      live_label_replay_support: body.decision_inputs.live_support,
      asof_support: body.decision_inputs.asof_support,
      difference: differenceOf(
        body.decision_inputs.asof_support,
        body.decision_inputs.live_support,
      ),
      public_explanation: publicExplanation(body),
    },
    evidence: {
      historical_cutoff: body.claim.as_of_date,
      window: { from: body.window.from, to: body.window.to },
      threshold: {
        usd: body.threshold.usd,
        basis: body.threshold.basis,
        rule: body.threshold.rule,
      },
      sources: (['historical_cohort', 'dated_activity', 'current_label_replay'] as const).map(
        (stage) => ({
          class: stage,
          status: stageStatus(body.layers, stage, body.truncated),
        }),
      ),
      settlement: body.settlement,
      powered_by: 'Nansen API',
    },
    commitments: {
      claim_hash: body.claim_hash,
      internal_commitment: internalCommitment,
      payload_root: hashSet(sourceHashes),
      payload_count: sourceHashes.length,
      source_hashes: sourceHashes,
    },
    restatement_notice: RESTATEMENT_NOTICE,
    disclaimer: DISCLAIMER,
  }
  if (body.restamp_of) out.restamp_of = body.restamp_of
  return out
}

export const PUBLIC_RECEIPT_VERSION = RECEIPT_VERSION
