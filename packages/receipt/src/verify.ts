import {
  PublicReceiptSchema,
  canonicalize,
  decide,
  deriveReceiptId,
  differenceOf,
  hashBytes,
  hashCanonical,
  hashSet,
  isPublicReason,
  publicClaimHash,
  type InternalReceipt,
  type PublicReceipt,
} from '@then/core'
import { evaluate, project, type SourceRecord } from '@then/engine'
import { payloadHashesOf } from './build'
import { toPublicReceipt } from './public'
import { verifyHash, type KeyRole, type TrustedKey } from './sign'
import type { CapturedPayloadLike } from './types'

export interface Check {
  name: string
  ok: boolean
  detail?: string
}

export interface VerifyReport {
  ok: boolean
  checks: Check[]
  signer: { key_id: string; role: KeyRole } | null
}

function report(checks: Check[], signer: VerifyReport['signer'] = null): VerifyReport {
  return { ok: checks.every((check) => check.ok), checks, signer }
}

export interface PublicVerifyOptions {
  trustedKeys: readonly TrustedKey[]
  /** Unsigned receipts fail unless this is false. */
  requireSignature?: boolean
}

/**
 * Integrity of a public receipt without any private data: schema, hash commitments, the
 * receipt-id derivation, the verdict recomputed from the published decision inputs, and the
 * signature against a trusted key.
 */
export function verifyPublic(input: unknown, options: PublicVerifyOptions): VerifyReport {
  const parsed = PublicReceiptSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return report([
      {
        name: 'schema',
        ok: false,
        detail: issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid',
      },
    ])
  }
  const receipt = parsed.data
  const checks: Check[] = [{ name: 'schema', ok: true }]

  const claimHash = publicClaimHash(receipt.claim)
  checks.push({
    name: 'claim_hash',
    ok: claimHash === receipt.claim_hash && claimHash === receipt.commitments.claim_hash,
    detail: claimHash,
  })

  const expectedId = deriveReceiptId({
    claim_hash: receipt.claim_hash,
    generated_at: receipt.generated_at,
    internal_commitment: receipt.commitments.internal_commitment,
  })
  checks.push({ name: 'receipt_id', ok: expectedId === receipt.receipt_id, detail: expectedId })

  const root = hashSet(receipt.commitments.source_hashes)
  checks.push({
    name: 'payload_root',
    ok:
      root === receipt.commitments.payload_root &&
      receipt.commitments.payload_count === receipt.commitments.source_hashes.length,
  })

  const decision = decide(receipt.decision_inputs)
  checks.push({
    name: 'verdict_rule',
    ok: decision.verdict === receipt.verdict,
    detail: `${decision.verdict} (${decision.reason})`,
  })
  checks.push({ name: 'rule_reason_listed', ok: receipt.reasons.includes(decision.reason) })
  checks.push({ name: 'public_reasons_only', ok: receipt.reasons.every(isPublicReason) })
  checks.push({
    name: 'comparison_consistent',
    ok:
      receipt.comparison.asof_support === receipt.decision_inputs.asof_support &&
      receipt.comparison.live_label_replay_support === receipt.decision_inputs.live_support &&
      receipt.comparison.difference ===
        differenceOf(receipt.decision_inputs.asof_support, receipt.decision_inputs.live_support),
  })
  const expectedFrom = new Date(
    Date.parse(`${receipt.claim.as_of_date}T00:00:00Z`) -
      (receipt.claim.window_hours / 24 - 1) * 86_400_000,
  )
    .toISOString()
    .slice(0, 10)
  checks.push({
    name: 'cutoff_matches_claim',
    ok:
      receipt.evidence.historical_cutoff === receipt.claim.as_of_date &&
      receipt.evidence.window.to === receipt.claim.as_of_date &&
      receipt.evidence.window.from === expectedFrom,
  })

  let signer: VerifyReport['signer'] = null
  if (!receipt.signature) {
    checks.push({ name: 'signature', ok: options.requireSignature === false, detail: 'unsigned' })
  } else {
    const { signature, ...unsigned } = receipt
    const publicHash = hashCanonical(unsigned)
    const key = options.trustedKeys.find((trusted) => trusted.key_id === signature.key_id)
    const valid =
      key !== undefined &&
      signature.public_hash === publicHash &&
      verifyHash(publicHash, signature.value, key.public_key_hex)
    if (key) signer = { key_id: key.key_id, role: key.role }
    checks.push({
      name: 'signature',
      ok: valid,
      detail: key ? `${key.role} key ${key.key_id}` : `unknown key ${signature.key_id}`,
    })
    if (key && key.role === 'fixture') {
      checks.push({ name: 'fixture_origin_matches_key', ok: receipt.origin === 'fixture' })
    }
    if (receipt.origin === 'fixture') {
      checks.push({ name: 'fixture_not_signed_as_live', ok: key?.role === 'fixture' })
    }
  }
  return report(checks, signer)
}

export interface PrivateBundle {
  internal: InternalReceipt
  records: SourceRecord[]
  payloads: CapturedPayloadLike[]
}

const REL_TOLERANCE = 1e-6

function numbersClose(a: unknown, b: unknown, path: string, mismatches: string[]): void {
  if (typeof a === 'number' && typeof b === 'number') {
    const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12)
    if (Math.abs(a - b) / scale > REL_TOLERANCE) mismatches.push(`${path}: ${a} ≠ ${b}`)
    return
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const key of keys) {
      numbersClose(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        `${path}.${key}`,
        mismatches,
      )
    }
    return
  }
  if (canonicalize(a ?? null) !== canonicalize(b ?? null))
    mismatches.push(`${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`)
}

/**
 * Full offline recomputation from an authorized private bundle. No network: stored payloads are
 * re-hashed, re-parsed with the same parser, and re-evaluated with the same engine.
 */
export function verifyFull(bundle: PrivateBundle, publicReceipt?: PublicReceipt): VerifyReport {
  const { internal, records } = bundle
  const body = internal.body
  const checks: Check[] = []

  const recomputedHashes = payloadHashesOf(records)
  checks.push({
    name: 'payload_hashes',
    ok: canonicalize(recomputedHashes) === canonicalize(body.payload_hashes),
    detail: `${Object.keys(recomputedHashes).length} stored bodies`,
  })

  const badRaw = bundle.payloads.filter((payload) => hashBytes(payload.body) !== payload.body_hash)
  const listed = new Set(body.layers.flatMap((layer) => layer.payload_ids))
  const unlisted = bundle.payloads.filter((payload) => !listed.has(payload.body_hash))
  checks.push({
    name: 'raw_responses',
    ok: badRaw.length === 0 && unlisted.length === 0,
    detail: `${bundle.payloads.length} responses, ${badRaw.length} tampered, ${unlisted.length} not in layer log`,
  })

  const commitment = hashCanonical(body)
  checks.push({
    name: 'internal_commitment',
    ok: publicReceipt ? publicReceipt.commitments.internal_commitment === commitment : true,
    detail: commitment,
  })
  const expectedId = deriveReceiptId({
    claim_hash: body.claim_hash,
    generated_at: body.generated_at,
    internal_commitment: commitment,
  })
  checks.push({ name: 'receipt_id', ok: expectedId === internal.receipt_id, detail: expectedId })

  const projections = project(records, {
    window: body.window,
    chain: body.claim.chain,
    token_address: body.claim.token_address,
  })
  const result = evaluate({
    claim: body.claim,
    window: body.window,
    settlement: body.settlement,
    ablation: body.decision_inputs.ablation,
    surface_available: body.surface_available,
    ...(body.unavailable_reason ? { unavailable_reason: body.unavailable_reason } : {}),
    calibration_window: body.calibration_window,
    projections,
  })
  checks.push({
    name: 'verdict_recomputed',
    ok: result.verdict === body.verdict,
    detail: `${result.verdict} vs stored ${body.verdict}`,
  })
  checks.push({
    name: 'reasons_recomputed',
    ok: canonicalize(result.reasons) === canonicalize(body.reasons),
  })
  checks.push({
    name: 'decision_inputs_recomputed',
    ok: canonicalize(result.decision_inputs) === canonicalize(body.decision_inputs),
  })
  const mismatches: string[] = []
  numbersClose(result.summary, body.summary, 'summary', mismatches)
  numbersClose(result.threshold, body.threshold, 'threshold', mismatches)
  numbersClose(result.asof, body.asof, 'asof', mismatches)
  numbersClose(result.live, body.live, 'live', mismatches)
  checks.push({
    name: 'numbers_recomputed',
    ok: mismatches.length === 0,
    ...(mismatches.length ? { detail: mismatches.slice(0, 5).join('; ') } : {}),
  })

  if (publicReceipt) {
    const expectedPublic = toPublicReceipt(internal.receipt_id, body, commitment)
    const { signature: _signature, ...unsigned } = publicReceipt
    void _signature
    checks.push({
      name: 'public_projection',
      ok: canonicalize(expectedPublic) === canonicalize(unsigned),
    })
  }
  return report(checks)
}
