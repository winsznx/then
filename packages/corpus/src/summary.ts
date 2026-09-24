import type { CorpusRow } from './run'

export type MechanismDecision = 'CONTINUE' | 'REVISE' | 'KILL'

export interface S0Summary {
  claims_tested: number
  claims_stamped: number
  complete_dual: number
  support_disagreements: number
  verdict_changing: number
  coverage_failures: number
  not_run: Record<string, number>
  verdicts: Record<string, number>
  drift_25pct: number
  asof_recoverable: number
  live_recoverable: number
  public_safe: 'PASS' | 'FAIL' | 'PARTIAL'
  decision: MechanismDecision
  decision_basis: string
}

const COVERAGE_FAILURE_REASONS = new Set([
  'NO_HISTORICAL_SNAPSHOT',
  'NO_ASOF_SURFACE',
  'UNSUPPORTED_CHAIN',
  'LIVE_REPLAY_UNAVAILABLE',
  'UPSTREAM_ERROR',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_RATE_LIMIT',
  'SCHEMA_DRIFT',
])

function count<T extends string>(values: T[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const value of values) out[value] = (out[value] ?? 0) + 1
  return out
}

/**
 * Applies the S0 decision rule exactly as frozen in the protocol:
 * KILL if either reconstruction is never recoverable, or n ≥ 10 with k/n < 10% and ≥ 90% of
 * claims within ±25% drift; REVISE if n < 10 or k/n < 10% with drift ≥ 25% in > 10%;
 * CONTINUE if n ≥ 10, k/n ≥ 10%, and the public projection passes.
 */
export function summarizeS0(
  rows: readonly CorpusRow[],
  publicSafe: 'PASS' | 'FAIL' | 'PARTIAL',
): S0Summary {
  const stamped = rows.filter((row) => row.status === 'stamped')
  const complete = stamped.filter(
    (row) => row.asof_support !== 'UNKNOWN' && row.live_support !== 'UNKNOWN',
  )
  const n = complete.length
  const k = complete.filter((row) => row.disagreement).length
  const drifted = complete.filter((row) => row.drifted === true)
  const asofRecoverable = stamped.filter((row) => row.asof_recoverable).length
  const liveRecoverable = stamped.filter((row) => row.live_recoverable).length

  let decision: MechanismDecision
  let basis: string
  if (stamped.length > 0 && (asofRecoverable === 0 || liveRecoverable === 0)) {
    decision = 'KILL'
    basis =
      asofRecoverable === 0
        ? 'as-of reconstruction recoverable for 0 claims'
        : 'current-label replay recoverable for 0 claims'
  } else if (n >= 10 && k / n < 0.1 && (n - drifted.length) / n >= 0.9) {
    decision = 'KILL'
    basis = `k/n = ${k}/${n} < 10% and ${n - drifted.length}/${n} claims within ±25% drift`
  } else if (n < 10) {
    decision = 'REVISE'
    basis = `only ${n} complete dual reconstructions (< 10)`
  } else if (k / n < 0.1) {
    decision = 'REVISE'
    basis = `k/n = ${k}/${n} < 10% while ${drifted.length}/${n} claims drift ≥ 25%`
  } else if (publicSafe !== 'PASS') {
    decision = 'REVISE'
    basis = `k/n = ${k}/${n} ≥ 10% but the public projection check is ${publicSafe}`
  } else {
    decision = 'CONTINUE'
    basis = `k/n = ${k}/${n} ≥ 10% with ${n} complete dual reconstructions`
  }

  return {
    claims_tested: rows.length,
    claims_stamped: stamped.length,
    complete_dual: n,
    support_disagreements: k,
    verdict_changing: complete.filter((row) => row.verdict_changing).length,
    coverage_failures: stamped.filter((row) =>
      row.reasons.some((reason) => COVERAGE_FAILURE_REASONS.has(reason)),
    ).length,
    not_run: count(
      rows.filter((row) => row.status === 'not_run').map((row) => row.not_run_reason ?? 'UNKNOWN'),
    ),
    verdicts: count(stamped.map((row) => row.verdict ?? 'NONE')),
    drift_25pct: drifted.length,
    asof_recoverable: asofRecoverable,
    live_recoverable: liveRecoverable,
    public_safe: publicSafe,
    decision,
    decision_basis: basis,
  }
}

const yn = (value: boolean | null): string => (value === null ? 'UNKNOWN' : value ? 'Y' : 'N')

function drift(row: CorpusRow): string {
  if (row.drift_ratio !== null) {
    return row.drift_ratio >= 100
      ? `${Math.round(row.drift_ratio)}×`
      : `${row.drift_ratio.toFixed(2)}×`
  }
  if (row.asof_value_usd === 0 && row.live_value_usd !== null)
    return row.live_value_usd === 0 ? 'both 0' : 'as-of 0'
  return '—'
}

export function s0Markdown(
  summary: S0Summary,
  rows: readonly CorpusRow[],
  meta: { generated_at: string; credits_used: number },
): string {
  const lines = [
    '# S0 murder test summary',
    '',
    `Generated ${meta.generated_at}. Protocol: \`.internal/evidence/S0_PROTOCOL.md\` (frozen before the first run, amendment 1 logged before the first run). Credits used this run: ${meta.credits_used}.`,
    '',
    '```text',
    `claims tested: ${summary.claims_tested}`,
    `claims stamped: ${summary.claims_stamped}`,
    `complete dual reconstructions: ${summary.complete_dual}`,
    `support disagreements: ${summary.support_disagreements}/${summary.complete_dual}`,
    `verdict-changing disagreements: ${summary.verdict_changing}/${summary.complete_dual}`,
    `historical coverage failures: ${summary.coverage_failures}`,
    `public-safe output status: ${summary.public_safe}`,
    '',
    `mechanism decision: ${summary.decision}`,
    `basis: ${summary.decision_basis}`,
    '```',
    '',
    `Verdicts: ${
      Object.entries(summary.verdicts)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ') || 'none'
    }. Not run: ${
      Object.entries(summary.not_run)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ') || 'none'
    }. Drift of 25% or more in ${summary.drift_25pct} of ${summary.complete_dual} complete claims.`,
    '',
    '| claim | chain | token | date | type | as-of recoverable | current-label recoverable | as-of support | current-label support | disagreement | verdict-changing | public-safe aggregate | verdict | drift | reason |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((row) =>
      [
        row.claim_id,
        row.chain,
        row.token_symbol,
        row.as_of_date,
        row.claim_type,
        row.status === 'stamped' ? yn(row.asof_recoverable) : '—',
        row.status === 'stamped' ? yn(row.live_recoverable) : '—',
        row.asof_support,
        row.live_support,
        yn(row.disagreement),
        yn(row.verdict_changing),
        row.status === 'stamped'
          ? yn(row.asof_support !== 'UNKNOWN' && row.live_support !== 'UNKNOWN')
          : '—',
        row.verdict ?? `not run (${row.not_run_reason})`,
        drift(row),
        row.reasons[0] ?? row.not_run_reason ?? '',
      ]
        .join(' | ')
        .replace(/^/, '| ')
        .replace(/$/, ' |'),
    ),
    '',
  ]
  return lines.join('\n')
}
