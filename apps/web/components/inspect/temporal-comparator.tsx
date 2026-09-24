import {
  REASONS,
  VERDICT_HEADLINES,
  claimSentence,
  decide,
  type PublicReceipt,
  type ReasonCode,
  type SourceClass,
  type SupportState,
} from '@then/core'
import { EvidenceStrip } from '@/components/receipt/evidence-strip'
import { SupportWord, VERDICT_STYLE, VerdictWord } from '@/components/verdict/verdict'
import { chainName, claimTypeName, formatDay, formatStamp } from '@/lib/format'

export interface DisplayClaim {
  claim_type: PublicReceipt['claim']['claim_type']
  chain: PublicReceipt['claim']['chain']
  token_symbol?: string | undefined
  token_address: string
  as_of_date: string
  window_hours: number
}

export type StageStatus = 'waiting' | 'running' | 'done' | 'failed' | 'disabled' | 'skipped'

export type ComparatorMode = 'live' | 'replay' | 'fixture'

export type ComparatorState =
  | { kind: 'pending'; claim: DisplayClaim; stages: Partial<Record<SourceClass, StageStatus>> }
  | { kind: 'result'; receipt: PublicReceipt; mode: ComparatorMode }

const SIDE_SENTENCE: Record<'live' | 'asof', Record<SupportState, string>> = {
  live: {
    YES: "Today's labels, applied to that date's activity, support the claim.",
    NO: "Today's labels, applied to that date's activity, do not support it.",
    UNKNOWN: "Today's-label replay could not be built.",
  },
  asof: {
    YES: 'The cohort recognized on that date supports the claim.',
    NO: 'The cohort recognized on that date does not support it.',
    UNKNOWN: 'The historical cohort could not be reconstructed.',
  },
}

const MODE_LABEL: Record<ComparatorMode, string> = {
  live: 'LIVE STAMP',
  replay: 'REPLAY',
  fixture: 'FIXTURE · SYNTHETIC DATA',
}

/** Reasons that only restate a side's support state; the two columns already say these. */
const RESTATES_SIDES: ReadonlySet<ReasonCode> = new Set([
  'ASOF_COHORT_SUPPORTS',
  'ASOF_COHORT_DOES_NOT_SUPPORT',
  'LIVE_LABEL_SUPPORT',
  'LIVE_LABELS_DO_NOT_SUPPORT',
])

export function modeOf(receipt: PublicReceipt, freshlyStamped: boolean): ComparatorMode {
  if (receipt.origin === 'fixture') return 'fixture'
  return freshlyStamped ? 'live' : 'replay'
}

function windowLabel(claim: DisplayClaim): string {
  return claim.window_hours > 24
    ? `${claim.window_hours / 24} days ending ${formatDay(claim.as_of_date)}`
    : formatDay(claim.as_of_date)
}

function ClaimBar({ claim }: { claim: DisplayClaim }) {
  return (
    <div className="border-b border-rule px-5 py-5 md:px-8 md:py-6">
      <p className="t-h3 text-ink">{claimSentence(claim)}</p>
      <p className="t-meta mt-2">
        {chainName(claim.chain)} · {windowLabel(claim)} (UTC) · {claimTypeName(claim.claim_type)}
      </p>
    </div>
  )
}

function Pending({ status }: { status: StageStatus | undefined }) {
  const settled =
    status === 'done' || status === 'failed' || status === 'disabled' || status === 'skipped'
  const text =
    status === 'failed'
      ? 'Source unavailable'
      : status === 'disabled'
        ? 'Switched off'
        : status === 'done'
          ? 'Reconstructed'
          : status === 'skipped'
            ? 'Not needed'
            : 'Reconstructing…'
  return (
    <div>
      <div
        aria-hidden="true"
        className={`h-[3px] w-24 bg-current ${settled ? '' : 'animate-pending'}`}
      />
      <p className="t-ui mt-4 text-meta">{text}</p>
    </div>
  )
}

function Side({
  side,
  title,
  support,
  footer,
  pending,
  resolved,
}: {
  side: 'live' | 'asof'
  title: string
  support: SupportState | null
  footer: string
  pending?: StageStatus | undefined
  resolved: boolean
}) {
  const asof = side === 'asof'
  return (
    <section
      aria-label={title}
      className={`flex flex-col gap-5 px-5 py-6 md:px-8 md:py-8 ${asof ? 'bg-time-wash text-time-deep max-md:order-1' : 'text-ink max-md:order-3'}`}
    >
      <h3 className="t-ui font-medium">{title}</h3>
      {support === null ? (
        <Pending status={pending} />
      ) : (
        <div className={resolved ? 'animate-resolve' : ''}>
          <p className="t-meta !text-current opacity-70">Support</p>
          <p className="mt-1 text-[40px] leading-none md:text-[48px]">
            <SupportWord state={support} />
          </p>
          <p className="t-ui mt-4 max-w-[36ch] text-ink-soft">{SIDE_SENTENCE[side][support]}</p>
        </div>
      )}
      <p className="t-meta mt-auto">{footer}</p>
    </section>
  )
}

/**
 * One claim, two clocks. Left: today's labels applied to the dated activity. Right: the cohort
 * recognized at the cutoff. The blue line between them is the date cut. The verdict band below
 * stays empty until both reconstructions resolve; nothing here is ever a placeholder number.
 */
export function TemporalComparator({
  state,
  headingLevel = 2,
  showVerdict = true,
  footer,
}: {
  state: ComparatorState
  headingLevel?: 2 | 3
  /** The receipt page states the verdict in its own header. */
  showVerdict?: boolean
  footer?: React.ReactNode
}) {
  const claim: DisplayClaim = state.kind === 'result' ? state.receipt.claim : state.claim
  const receipt = state.kind === 'result' ? state.receipt : null
  const date = formatDay(claim.as_of_date)
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  const resolved = state.kind === 'result' && state.mode === 'live'

  return (
    <article
      className="overflow-hidden rounded-lg border border-rule-strong bg-workspace"
      aria-label="Temporal comparison"
    >
      <Heading className="sr-only">Was this Smart Money then?</Heading>
      <ClaimBar claim={claim} />
      <div className="relative grid md:grid-cols-2">
        <Side
          side="live"
          title="Today's labels on that date"
          support={receipt ? receipt.comparison.live_label_replay_support : null}
          pending={state.kind === 'pending' ? state.stages.current_label_replay : undefined}
          footer="Nansen labels as of today"
          resolved={resolved}
        />
        <Side
          side="asof"
          title={`As of ${date}`}
          support={receipt ? receipt.comparison.asof_support : null}
          pending={state.kind === 'pending' ? state.stages.historical_cohort : undefined}
          footer={`Cutoff ${date}, end of day UTC`}
          resolved={resolved}
        />
        {/* The date cut: vertical between the columns; horizontal between the stacked sides on mobile. */}
        <div
          aria-hidden="true"
          className="absolute top-0 bottom-0 left-1/2 hidden w-[2px] -translate-x-1/2 bg-time animate-cut md:block"
        />
        <div aria-hidden="true" className="h-[2px] bg-time md:hidden max-md:order-2" />
      </div>
      {showVerdict ? <VerdictBand receipt={receipt} /> : null}
      {receipt ? <EvidenceStrip receipt={receipt} /> : null}
      <ReceiptLine receipt={receipt} mode={state.kind === 'result' ? state.mode : null} />
      {footer ? <div className="border-t border-rule">{footer}</div> : null}
    </article>
  )
}

function VerdictBand({ receipt }: { receipt: PublicReceipt | null }) {
  if (!receipt) {
    return (
      <div className="border-t border-rule px-5 py-7 md:px-8">
        <p className="t-meta">Verdict</p>
        <p className="t-ui mt-2 text-meta">Appears when both reconstructions have resolved.</p>
      </div>
    )
  }
  const style = VERDICT_STYLE[receipt.verdict]
  const decisive = decide(receipt.decision_inputs).reason
  const notes = receipt.reasons.filter(
    (reason) => reason !== decisive && !RESTATES_SIDES.has(reason),
  )
  return (
    <div className={`border-t border-rule px-5 py-7 md:px-8 md:py-9 ${style.wash}`}>
      <p className="t-meta">Verdict</p>
      <p className="animate-stamp mt-1 text-[40px] leading-none md:text-[56px]">
        <VerdictWord verdict={receipt.verdict} />
      </p>
      <div
        className={`animate-rule mt-4 h-px w-full max-w-[220px] ${style.rule}`}
        aria-hidden="true"
      />
      <p className="t-lead mt-4 max-w-[62ch] !text-ink">{VERDICT_HEADLINES[receipt.verdict]}</p>
      <p className="t-ui mt-2 max-w-[70ch] text-ink-soft">
        {receipt.comparison.public_explanation}
      </p>
      {notes.length > 0 ? (
        <ul className="mt-4 max-w-[70ch] space-y-1">
          {notes.map((reason) => (
            <li key={reason} className="t-ui flex gap-2 text-ink-soft">
              <span aria-hidden="true" className="mt-[9px] h-px w-3 shrink-0 bg-current" />
              {REASONS[reason].text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function ReceiptLine({
  receipt,
  mode,
}: {
  receipt: PublicReceipt | null
  mode: ComparatorMode | null
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-rule px-5 py-4 md:px-8">
      <p className="t-meta">
        {receipt ? (
          <>
            <span className="text-ink">{receipt.receipt_id}</span>
            {mode ? (
              <>
                {' · '}
                <span
                  className={
                    mode === 'live' ? 'font-medium text-time-deep' : 'font-medium text-ink'
                  }
                >
                  {MODE_LABEL[mode]}
                </span>
              </>
            ) : null}
            {' · '}
            {formatStamp(receipt.generated_at)} · method {receipt.method_version}
          </>
        ) : (
          'The receipt is written when the stamp completes'
        )}
      </p>
      <p className="t-meta flex items-center gap-2">
        <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-nansen" />
        Powered by Nansen API
      </p>
    </div>
  )
}
