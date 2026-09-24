import type { SupportState, Verdict } from '@then/core'

export const VERDICT_STYLE: Record<Verdict, { text: string; wash: string; rule: string }> = {
  VALID: { text: 'text-valid', wash: 'bg-valid-wash', rule: 'bg-valid' },
  CONTAMINATED: {
    text: 'text-contaminated',
    wash: 'bg-contaminated-wash',
    rule: 'bg-contaminated',
  },
  INSUFFICIENT: {
    text: 'text-insufficient',
    wash: 'bg-insufficient-wash',
    rule: 'bg-insufficient',
  },
}

export const VERDICT_MEANING: Record<Verdict, string> = {
  VALID: 'The cohort Nansen recognized on the claim date supports the claim.',
  CONTAMINATED: "Today's labels create support that was not there on the claim date.",
  INSUFFICIENT: 'The historical evidence is too thin or unavailable to decide.',
}

/** The verdict as a word in its color. The word carries the meaning; color only reinforces it. */
export function VerdictWord({ verdict, className = '' }: { verdict: Verdict; className?: string }) {
  return <span className={`t-verdict ${VERDICT_STYLE[verdict].text} ${className}`}>{verdict}</span>
}

const SUPPORT_TEXT: Record<SupportState, string> = {
  YES: 'YES',
  NO: 'NO',
  UNKNOWN: 'UNKNOWN',
}

export function SupportWord({
  state,
  className = '',
}: {
  state: SupportState
  className?: string
}) {
  return (
    <span
      className={`font-semibold tracking-[-0.01em] tabular-nums ${state === 'UNKNOWN' ? 'text-meta' : ''} ${className}`}
    >
      {SUPPORT_TEXT[state]}
    </span>
  )
}
