/** The only three public verdicts. There is no fourth badge. */
export const VERDICTS = ['VALID', 'CONTAMINATED', 'INSUFFICIENT'] as const
export type Verdict = (typeof VERDICTS)[number]

export const SUPPORT_STATES = ['YES', 'NO', 'UNKNOWN'] as const
export type SupportState = (typeof SUPPORT_STATES)[number]

export type Difference = 'MATERIAL' | 'NONE' | 'UNKNOWN'

interface ReasonSpec {
  /** Safe to show on public receipts. Internal-only codes stay in the private bundle. */
  public: boolean
  /** One plain-English sentence for receipts and the Inspect result. */
  text: string
}

export const REASONS = {
  ASOF_COHORT_SUPPORTS: {
    public: true,
    text: 'The cohort Nansen recognized as Smart Money on the claim date supports the claim.',
  },
  ASOF_COHORT_DOES_NOT_SUPPORT: {
    public: true,
    text: 'The cohort recognized on the claim date does not support the claim.',
  },
  LIVE_LABEL_SUPPORT: {
    public: true,
    text: "Applying today's Smart Money labels to the dated activity supports the claim.",
  },
  LIVE_LABELS_DO_NOT_SUPPORT: {
    public: true,
    text: "Today's labels applied to the dated activity do not support the claim.",
  },
  LABEL_DRIFT_ATTRIBUTED: {
    public: true,
    text: 'The difference comes from wallets that carry the Smart Money label today but did not on the claim date.',
  },
  NEITHER_SUPPORTS: {
    public: true,
    text: "Neither the cohort on the claim date nor today's labels support the claim at the threshold.",
  },
  DISAGREEMENT_NOT_LABEL_DRIVEN: {
    public: true,
    text: 'The two reconstructions differ, but not because of label changes, so THEN will not call it contamination.',
  },
  ASOF_SOURCES_CONFLICT: {
    public: true,
    text: 'Point-in-time sources disagree in direction above the threshold.',
  },
  LIVE_SOURCES_CONFLICT: {
    public: true,
    text: 'Current-label sources disagree in direction above the threshold.',
  },
  NO_ASOF_SURFACE: {
    public: true,
    text: 'No point-in-time Smart Money surface covers this claim.',
  },
  NO_HISTORICAL_SNAPSHOT: {
    public: true,
    text: 'Nansen returned no settled historical snapshot for this date.',
  },
  LIVE_REPLAY_UNAVAILABLE: {
    public: true,
    text: "Today's-label replay could not be built, so contamination cannot be tested.",
  },
  DATE_NOT_SETTLED: {
    public: true,
    text: 'The claim date has not settled. Historical snapshots exist only for past UTC days.',
  },
  SNAPSHOT_FALLBACK_DATE: {
    public: true,
    text: 'A snapshot from the previous settled day was used, at the user’s request.',
  },
  SPONSOR_HISTORICAL_DISABLED: {
    public: true,
    text: 'Point-in-time Nansen data is switched off, so THEN cannot stamp VALID or CONTAMINATED.',
  },
  UNSUPPORTED_CHAIN: {
    public: true,
    text: 'Nansen has no point-in-time surface for this chain and claim type.',
  },
  UNSUPPORTED_CLAIM_TYPE: {
    public: true,
    text: 'No dated Nansen surface supports this claim type yet.',
  },
  AMBIGUOUS_TOKEN: {
    public: true,
    text: 'The token matches more than one contract. Pick the exact address.',
  },
  TOKEN_NOT_FOUND: { public: true, text: 'Nansen does not index this token on this chain.' },
  UPSTREAM_TIMEOUT: { public: true, text: 'Nansen did not answer in time.' },
  UPSTREAM_RATE_LIMIT: { public: true, text: 'Nansen rate-limited the request.' },
  UPSTREAM_ERROR: { public: true, text: 'Nansen returned an error for a required source.' },
  SCHEMA_DRIFT: {
    public: true,
    text: 'A beta endpoint returned a shape THEN does not recognize, so that source was not used.',
  },
  ASOF_WALLET_MEMBERSHIP_UNAVAILABLE: {
    public: true,
    text: 'Wallet-level point-in-time membership was unavailable, so the comparison is aggregate only.',
  },
  THRESHOLD_VOLUME_UNKNOWN: {
    public: true,
    text: 'Day volume was unavailable, so the minimum threshold was used.',
  },
  RECENT_WINDOW: {
    public: true,
    text: 'The claim date is recent. Nansen may still revise this window.',
  },
  ROW_CAP: { public: false, text: 'A source hit the row cap and was truncated.' },
  PRICE_FALLBACK_ENDPOINT_USD: {
    public: false,
    text: 'No reference price, so endpoint USD values were used for valuation.',
  },
  METHOD_UNCALIBRATED: {
    public: false,
    text: 'The aggregate pair never matched on recent days, so its difference cannot be attributed to labels.',
  },
  FUND_INCLUDED: {
    public: true,
    text: 'Fund wallets were included on the point-in-time side for a date before they left the cohort.',
  },
} as const satisfies Record<string, ReasonSpec>

export type ReasonCode = keyof typeof REASONS

export const REASON_CODES = Object.keys(REASONS) as ReasonCode[]

export function isPublicReason(code: ReasonCode): boolean {
  return REASONS[code].public
}

export const VERDICT_HEADLINES: Record<Verdict, string> = {
  VALID: 'The cohort evaluated at the historical cutoff supports this claim.',
  CONTAMINATED: 'Current labels create support that was not present at the historical cutoff.',
  INSUFFICIENT: 'The available historical surface cannot support a reliable decision.',
}

export const DISCLAIMER =
  'THEN does not predict price. VALID means the dated Smart Money cohort supports the claim, not that the trade is good.'

export const RESTATEMENT_NOTICE =
  'Nansen recomputes historical results at request time and may restate them after late data, pricing fixes, or label-history corrections. This receipt records what was fetched when it was stamped. A later restamp can differ; the original never changes.'
