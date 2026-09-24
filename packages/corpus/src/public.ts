import type { CorpusRow } from './run'

/**
 * A corpus row as it may be published: claim context, support states, verdict, completeness,
 * the evaluation-only forward return, and the receipt link. Smart Money USD values and the
 * per-claim drift ratio stay private.
 */
export interface PublicCorpusRow {
  claim_id: string
  source_url: string
  quote: string
  chain: string
  token_symbol: string
  as_of_date: string
  claim_type: string
  window_hours: number
  selection_role: string
  status: 'stamped' | 'not_run'
  not_run_reason: string | null
  verdict: string | null
  asof_support: string
  live_support: string
  complete: boolean
  disagreement: boolean | null
  forward_return_7d: number | null
  receipt_id: string | null
}

export function publicCorpusRow(row: CorpusRow & { receipt_id?: string }): PublicCorpusRow {
  return {
    claim_id: row.claim_id,
    source_url: row.source_url,
    quote: row.quote,
    chain: row.chain,
    token_symbol: row.token_symbol,
    as_of_date: row.as_of_date,
    claim_type: row.claim_type,
    window_hours: row.window_hours,
    selection_role: row.selection_role,
    status: row.status,
    not_run_reason: row.not_run_reason,
    verdict: row.verdict,
    asof_support: row.asof_support,
    live_support: row.live_support,
    complete:
      row.status === 'stamped' && row.asof_support !== 'UNKNOWN' && row.live_support !== 'UNKNOWN',
    disagreement: row.disagreement,
    forward_return_7d: row.forward_return_7d,
    receipt_id: row.receipt_id ?? null,
  }
}
