import type { InternalReceipt, SupportState, Verdict } from '@then/core'

/**
 * What changed between an original receipt and a later restamp of the same claim. The original
 * is never rewritten; this report sits beside it.
 */
export interface DriftReport {
  kind: 'then.restamp.drift'
  original_receipt_id: string
  restamp_receipt_id: string
  original_generated_at: string
  restamp_generated_at: string
  verdict: { original: Verdict; restamp: Verdict; changed: boolean }
  /** A restamp runs under the current method; a changed rule can move a verdict on its own. */
  method: { original: string; restamp: string; changed: boolean }
  asof_support: { original: SupportState; restamp: SupportState; changed: boolean }
  live_support: { original: SupportState; restamp: SupportState; changed: boolean }
  sources: { source: string; changed: boolean }[]
  restated: boolean
}

function hashesBySource(receipt: InternalReceipt): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [key, hash] of Object.entries(receipt.body.payload_hashes).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const source = key.split('#')[0] ?? key
    out.set(source, [...(out.get(source) ?? []), hash])
  }
  return out
}

export function compareReceipts(original: InternalReceipt, restamp: InternalReceipt): DriftReport {
  const before = hashesBySource(original)
  const after = hashesBySource(restamp)
  const sources = [...new Set([...before.keys(), ...after.keys()])].sort().map((source) => ({
    source,
    changed: (before.get(source) ?? []).join(',') !== (after.get(source) ?? []).join(','),
  }))
  const o = original.body
  const r = restamp.body
  return {
    kind: 'then.restamp.drift',
    original_receipt_id: original.receipt_id,
    restamp_receipt_id: restamp.receipt_id,
    original_generated_at: o.generated_at,
    restamp_generated_at: r.generated_at,
    verdict: { original: o.verdict, restamp: r.verdict, changed: o.verdict !== r.verdict },
    method: {
      original: o.method_version,
      restamp: r.method_version,
      changed: o.method_version !== r.method_version,
    },
    asof_support: {
      original: o.decision_inputs.asof_support,
      restamp: r.decision_inputs.asof_support,
      changed: o.decision_inputs.asof_support !== r.decision_inputs.asof_support,
    },
    live_support: {
      original: o.decision_inputs.live_support,
      restamp: r.decision_inputs.live_support,
      changed: o.decision_inputs.live_support !== r.decision_inputs.live_support,
    },
    sources,
    restated: sources.some((source) => source.changed),
  }
}
