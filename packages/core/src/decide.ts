import type { ReasonCode, SupportState, Verdict } from './verdict'

/**
 * Everything the verdict depends on, as public-safe booleans and support states.
 * Public receipts publish these so anyone can recompute the verdict.
 */
export interface DecisionInputs {
  /** Point-in-time Nansen surfaces were switched off for this stamp. */
  ablation: boolean
  /** The claim date is a settled UTC day. */
  date_settled: boolean
  /** Some point-in-time surface exists for this chain and claim type. */
  surface_available: boolean
  /** At least one primary point-in-time source returned usable data. */
  asof_floor_met: boolean
  /** Point-in-time sources disagree in direction above the threshold. */
  asof_conflict: boolean
  asof_support: SupportState
  /** At least one primary current-label source returned usable data. */
  live_floor_met: boolean
  live_support: SupportState
  /**
   * When today's labels support the claim and the as-of cohort does not: whether wallets that
   * joined the cohort after the claim date account for the difference. Null when not applicable.
   */
  label_drift_attributed: boolean | null
}

export interface Decision {
  verdict: Verdict
  reason: ReasonCode
}

/**
 * The single verdict rule. VALID needs as-of support. CONTAMINATED needs current-label support,
 * no as-of support, and a difference attributable to label drift. Everything else is INSUFFICIENT.
 */
export function decide(inputs: DecisionInputs): Decision {
  if (inputs.ablation) return { verdict: 'INSUFFICIENT', reason: 'SPONSOR_HISTORICAL_DISABLED' }
  if (!inputs.date_settled) return { verdict: 'INSUFFICIENT', reason: 'DATE_NOT_SETTLED' }
  if (!inputs.surface_available) return { verdict: 'INSUFFICIENT', reason: 'NO_ASOF_SURFACE' }
  if (!inputs.asof_floor_met) return { verdict: 'INSUFFICIENT', reason: 'NO_HISTORICAL_SNAPSHOT' }
  if (inputs.asof_conflict) return { verdict: 'INSUFFICIENT', reason: 'ASOF_SOURCES_CONFLICT' }
  if (inputs.asof_support === 'YES') return { verdict: 'VALID', reason: 'ASOF_COHORT_SUPPORTS' }
  if (inputs.asof_support !== 'NO')
    return { verdict: 'INSUFFICIENT', reason: 'NO_HISTORICAL_SNAPSHOT' }
  if (!inputs.live_floor_met || inputs.live_support === 'UNKNOWN') {
    return { verdict: 'INSUFFICIENT', reason: 'LIVE_REPLAY_UNAVAILABLE' }
  }
  if (inputs.live_support === 'YES') {
    return inputs.label_drift_attributed === true
      ? { verdict: 'CONTAMINATED', reason: 'LABEL_DRIFT_ATTRIBUTED' }
      : { verdict: 'INSUFFICIENT', reason: 'DISAGREEMENT_NOT_LABEL_DRIVEN' }
  }
  return { verdict: 'INSUFFICIENT', reason: 'NEITHER_SUPPORTS' }
}

export function differenceOf(
  asof: SupportState,
  live: SupportState,
): 'MATERIAL' | 'NONE' | 'UNKNOWN' {
  if (asof === 'UNKNOWN' || live === 'UNKNOWN') return 'UNKNOWN'
  return asof === live ? 'NONE' : 'MATERIAL'
}
