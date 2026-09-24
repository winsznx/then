'use client'

import {
  VERDICT_HEADLINES,
  claimSentence,
  decide,
  type ClaimInput,
  type PublicReceipt,
  type SourceClass,
} from '@then/core'
import Link from 'next/link'
import { useEffect, useReducer, useRef, useState } from 'react'
import { ReceiptActions } from '@/components/receipt/receipt-actions'
import { TradePanel } from '@/components/receipt/trade-panel'
import { api } from '@/lib/client/api'
import { track } from '@/lib/client/track'
import { formatStamp } from '@/lib/format'
import { ClaimComposer } from './claim-composer'
import { draftFromClaim, errorsFromIssues, type Draft, type DraftErrors } from './draft'
import { ReconstructionProgress } from './reconstruction-progress'
import {
  TemporalComparator,
  modeOf,
  type DisplayClaim,
  type StageStatus,
} from './temporal-comparator'

type Stages = Partial<Record<SourceClass, StageStatus>>

interface Problem {
  code: string
  message: string
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'example'; receipt: PublicReceipt }
  | { kind: 'starting'; claim: DisplayClaim; startedAt: number }
  | { kind: 'running'; claim: DisplayClaim; jobId: string; stages: Stages; startedAt: number }
  | { kind: 'done'; receipt: PublicReceipt; reused: boolean }
  | { kind: 'failed'; claim: DisplayClaim | null; problem: Problem; jobId: string | null }

type Action =
  | { type: 'start'; claim: DisplayClaim; at: number }
  | { type: 'accepted'; jobId: string }
  | { type: 'progress'; jobId: string; stages: Stages }
  | { type: 'finished'; receipt: PublicReceipt; reused: boolean; jobId: string | null }
  | { type: 'failed'; problem: Problem; jobId: string | null }
  | { type: 'resume'; jobId: string; at: number }
  | { type: 'example'; receipt: PublicReceipt }
  | { type: 'reset' }

function reduce(phase: Phase, action: Action): Phase {
  switch (action.type) {
    case 'start':
      return { kind: 'starting', claim: action.claim, startedAt: action.at }
    case 'accepted':
      return phase.kind === 'starting'
        ? {
            kind: 'running',
            claim: phase.claim,
            jobId: action.jobId,
            stages: {},
            startedAt: phase.startedAt,
          }
        : phase
    case 'progress':
      return phase.kind === 'running' && phase.jobId === action.jobId
        ? { ...phase, stages: action.stages }
        : phase
    case 'finished':
      if (action.jobId !== null && !(phase.kind === 'running' && phase.jobId === action.jobId))
        return phase
      if (action.jobId === null && phase.kind !== 'starting') return phase
      return { kind: 'done', receipt: action.receipt, reused: action.reused }
    case 'failed': {
      if (action.jobId !== null && !(phase.kind === 'running' && phase.jobId === action.jobId))
        return phase
      const claim = phase.kind === 'starting' || phase.kind === 'running' ? phase.claim : null
      return { kind: 'failed', claim, problem: action.problem, jobId: action.jobId }
    }
    case 'resume':
      return phase.kind === 'failed' && phase.claim
        ? {
            kind: 'running',
            claim: phase.claim,
            jobId: action.jobId,
            stages: {},
            startedAt: action.at,
          }
        : phase
    case 'example':
      return { kind: 'example', receipt: action.receipt }
    case 'reset':
      return { kind: 'idle' }
  }
}

interface StatusResponse {
  status: 'running' | 'done' | 'failed'
  stages: Stages
  error: string | null
  receipt: PublicReceipt | null
}

type StampResponse =
  { status: 'running'; job_id: string } | { status: 'done'; receipt: PublicReceipt; reused: true }

/** A stamp is bounded at 45 seconds server-side; polling gives up well after that. */
const POLL_LIMIT_MS = 120_000

const STAMP_FAILED = 'The stamp failed before a receipt was written. Nothing was recorded.'

const JOB_ERRORS: Record<string, string> = {
  API_KEY_REJECTED: 'Nansen rejected the API key, so THEN cannot stamp. Nothing was recorded.',
  STAMP_FAILED,
}

function displayClaim(input: ClaimInput): DisplayClaim {
  return {
    claim_type: input.claim_type,
    chain: input.chain,
    token_symbol: input.token_symbol,
    token_address: input.token_address,
    as_of_date: input.as_of_date,
    window_hours: input.window_hours ?? 24,
  }
}

type NextAction = { label: string; href: string } | { label: string; run: 'resubmit' | 'poll' }

function problemAction(problem: Problem, githubUrl: string): NextAction {
  switch (problem.code) {
    case 'QUOTA_REACHED':
      return { label: "Play today's Challenge", href: '/challenge' }
    case 'NO_API_KEY':
    case 'NO_SIGNING_KEY':
      return { label: 'Browse stored receipts', href: '/corpus' }
    case 'RATE_LIMITED':
      return { label: 'Run THEN with your own Nansen key', href: `${githubUrl}/blob/main/SETUP.md` }
    case 'API_KEY_REJECTED':
      return { label: 'Read the setup guide', href: `${githubUrl}/blob/main/SETUP.md` }
    case 'POLL_TIMEOUT':
      return { label: 'Check again', run: 'poll' }
    default:
      return { label: 'Try again', run: 'resubmit' }
  }
}

function insufficientAction(receipt: PublicReceipt): NextAction | null {
  if (receipt.verdict !== 'INSUFFICIENT') return null
  if (
    receipt.reasons.some(
      (reason) =>
        reason === 'UPSTREAM_TIMEOUT' ||
        reason === 'UPSTREAM_RATE_LIMIT' ||
        reason === 'UPSTREAM_ERROR',
    )
  ) {
    return { label: 'Stamp again', run: 'resubmit' }
  }
  switch (decide(receipt.decision_inputs).reason) {
    case 'NO_ASOF_SURFACE':
      return { label: 'See which chains have dated data', href: '/limits#coverage' }
    case 'NO_HISTORICAL_SNAPSHOT':
      return { label: 'Why a snapshot can be missing', href: '/limits#snapshots' }
    case 'DATE_NOT_SETTLED':
      return { label: 'How settlement works', href: '/method#settlement' }
    case 'SPONSOR_HISTORICAL_DISABLED':
      return { label: 'Why THEN refuses without point-in-time data', href: '/method#ablation' }
    default:
      return { label: 'How THEN decides', href: '/method#verdicts' }
  }
}

function ActionButton({
  action,
  onRun,
}: {
  action: NextAction
  onRun: (run: 'resubmit' | 'poll') => void
}) {
  const className =
    't-ui inline-flex h-11 items-center rounded-md border border-ink px-4 font-medium text-ink transition-colors duration-[var(--dur-fast)] hover:bg-band'
  if ('href' in action) {
    return action.href.startsWith('/') ? (
      <Link href={action.href} className={className}>
        {action.label}
      </Link>
    ) : (
      <a href={action.href} className={className} rel="noreferrer">
        {action.label}
      </a>
    )
  }
  return (
    <button type="button" className={className} onClick={() => onRun(action.run)}>
      {action.label}
    </button>
  )
}

function FirstRun({ example, onLoad }: { example: PublicReceipt | null; onLoad: () => void }) {
  return (
    <section
      aria-label="Getting started"
      className="grid gap-8 rounded-lg border border-dashed border-rule-strong px-5 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:px-8"
    >
      <div>
        <h2 className="t-h3">Try a replayed claim</h2>
        {example ? (
          <>
            <p className="t-lead mt-3">“{claimSentence(example.claim)}.”</p>
            <button
              type="button"
              onClick={onLoad}
              className="t-ui mt-5 inline-flex h-11 items-center rounded-md bg-ink px-4 font-medium text-white transition-colors duration-[var(--dur-fast)] hover:bg-ink-soft"
            >
              Load example
            </button>
          </>
        ) : (
          <p className="t-ui mt-3 max-w-[44ch] text-ink-soft">
            No stored receipt is published on this deployment yet. Enter a claim above to stamp one.
          </p>
        )}
      </div>
      <div className="t-ui space-y-3 text-ink-soft md:border-l md:border-rule md:pl-8">
        <p>
          A replay shows a stored receipt exactly as it was stamped. It is labeled{' '}
          <span className="font-medium text-ink">REPLAY</span> and is never presented as a live
          result.
        </p>
        <p>
          A new stamp reads Nansen twice for the same date: once through today&apos;s Smart Money
          labels, once through the cohort Nansen recognized on that day. The verdict comes from
          comparing the two.
        </p>
      </div>
    </section>
  )
}

/**
 * The Inspect instrument. The browser sends a claim and polls a job; the verdict always arrives
 * inside a receipt built on the server. A new claim clears the previous result immediately.
 */
export function InspectWorkspace({
  initial,
  example,
  lastSettled,
  tradeMode,
  githubUrl,
}: {
  initial: Draft
  example: PublicReceipt | null
  lastSettled: string
  tradeMode: 'paper' | 'live'
  githubUrl: string
}) {
  const [phase, dispatch] = useReducer(reduce, { kind: 'idle' })
  const [composer, setComposer] = useState({ key: 0, draft: initial })
  const lastInput = useRef<ClaimInput | null>(null)
  const jobId = phase.kind === 'running' ? phase.jobId : null

  useEffect(() => {
    track('inspect_opened')
  }, [])

  useEffect(() => {
    if (!jobId) return
    const controller = new AbortController()
    let timer: number | undefined
    const began = Date.now()

    function schedule(delayMs: number) {
      timer = window.setTimeout(() => {
        poll().catch((error: unknown) => {
          dispatch({
            type: 'failed',
            jobId,
            problem: {
              code: 'CLIENT_ERROR',
              message: `Checking the stamp failed in this browser: ${String(error)}`,
            },
          })
        })
      }, delayMs)
    }

    async function poll() {
      let result
      try {
        result = await api<StatusResponse>(`/api/stamp/${jobId}/status`, {
          signal: controller.signal,
        })
      } catch (error) {
        if (controller.signal.aborted) return
        throw error
      }
      if (controller.signal.aborted || !jobId) return
      const overdue = Date.now() - began > POLL_LIMIT_MS
      if (!result.ok) {
        if (result.status === 0 && !overdue) {
          schedule(2000)
          return
        }
        dispatch({ type: 'failed', jobId, problem: { code: result.code, message: result.message } })
        return
      }
      const status = result.data
      if (status.status === 'done') {
        if (status.receipt)
          dispatch({ type: 'finished', jobId, receipt: status.receipt, reused: false })
        else
          dispatch({
            type: 'failed',
            jobId,
            problem: {
              code: 'RECEIPT_MISSING',
              message: 'The stamp finished but its receipt could not be loaded.',
            },
          })
        return
      }
      if (status.status === 'failed') {
        const code = status.error ?? 'STAMP_FAILED'
        dispatch({
          type: 'failed',
          jobId,
          problem: { code, message: JOB_ERRORS[code] ?? STAMP_FAILED },
        })
        return
      }
      dispatch({ type: 'progress', jobId, stages: status.stages })
      if (overdue) {
        dispatch({
          type: 'failed',
          jobId,
          problem: {
            code: 'POLL_TIMEOUT',
            message: 'The stamp is taking longer than expected. It may still finish.',
          },
        })
        return
      }
      schedule(1000)
    }

    schedule(600)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [jobId])

  async function stamp(input: ClaimInput): Promise<DraftErrors | null> {
    lastInput.current = input
    dispatch({ type: 'start', claim: displayClaim(input), at: Date.now() })
    track('claim_submitted', { chain: input.chain, claim_type: input.claim_type })
    const result = await api<StampResponse>('/api/stamp', { method: 'POST', json: input })
    if (!result.ok) {
      if (result.code === 'INVALID_CLAIM' && result.issues) {
        dispatch({ type: 'reset' })
        return errorsFromIssues(result.issues)
      }
      dispatch({
        type: 'failed',
        jobId: null,
        problem: { code: result.code, message: result.message },
      })
      return null
    }
    if (result.data.status === 'done') {
      dispatch({ type: 'finished', jobId: null, receipt: result.data.receipt, reused: true })
    } else {
      dispatch({ type: 'accepted', jobId: result.data.job_id })
      track('stamp_started', { chain: input.chain, claim_type: input.claim_type })
    }
    return null
  }

  function run(kind: 'resubmit' | 'poll') {
    if (kind === 'poll' && phase.kind === 'failed' && phase.jobId)
      dispatch({ type: 'resume', jobId: phase.jobId, at: Date.now() })
    else if (lastInput.current) void stamp(lastInput.current)
  }

  function loadExample() {
    if (!example) return
    dispatch({ type: 'example', receipt: example })
    setComposer((current) => ({ key: current.key + 1, draft: draftFromClaim(example.claim) }))
    track('example_loaded', { verdict: example.verdict, chain: example.claim.chain })
  }

  const busy = phase.kind === 'starting' || phase.kind === 'running'
  const announcement =
    phase.kind === 'done'
      ? `Verdict ${phase.receipt.verdict}. ${VERDICT_HEADLINES[phase.receipt.verdict]}`
      : busy
        ? 'Stamping. Reconstructing both sides.'
        : ''

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <ClaimComposer
        key={composer.key}
        initial={composer.draft}
        lastSettled={lastSettled}
        busy={busy}
        onStamp={stamp}
      />
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {phase.kind === 'idle' ? <FirstRun example={example} onLoad={loadExample} /> : null}

      {phase.kind === 'starting' || phase.kind === 'running' ? (
        <>
          <ReconstructionProgress
            key={phase.startedAt}
            date={phase.claim.as_of_date}
            stages={phase.kind === 'running' ? phase.stages : {}}
            startedAt={phase.startedAt}
          />
          <TemporalComparator
            state={{
              kind: 'pending',
              claim: phase.claim,
              stages: phase.kind === 'running' ? phase.stages : {},
            }}
          />
        </>
      ) : null}

      {phase.kind === 'failed' ? (
        <section
          aria-label="Stamp did not complete"
          className="rounded-lg border border-rule-strong bg-workspace px-5 py-6 md:px-8"
        >
          {phase.claim ? <p className="t-meta">{claimSentence(phase.claim)}</p> : null}
          <h2 className="t-h3 mt-2">No verdict was stamped</h2>
          <p className="t-ui mt-2 max-w-[62ch] text-ink-soft">{phase.problem.message}</p>
          <div className="mt-5">
            <ActionButton action={problemAction(phase.problem, githubUrl)} onRun={run} />
          </div>
        </section>
      ) : null}

      {phase.kind === 'example' || phase.kind === 'done' ? (
        <div className="flex flex-col gap-3">
          {phase.kind === 'example' ? (
            <p className="t-ui text-ink-soft">
              Replay of a stored receipt stamped {formatStamp(phase.receipt.generated_at)}. It is
              not a live result. Press Stamp to check the same claim against Nansen now.
            </p>
          ) : phase.reused ? (
            <p className="t-ui text-ink-soft">
              The same claim was stamped at {formatStamp(phase.receipt.generated_at)}, so THEN is
              showing that receipt instead of spending Nansen credits again.
            </p>
          ) : null}
          <ResultFrame
            receipt={phase.receipt}
            fresh={phase.kind === 'done' && !phase.reused}
            tradeMode={tradeMode}
            onRun={run}
          />
        </div>
      ) : null}
    </div>
  )
}

function ResultFrame({
  receipt,
  fresh,
  tradeMode,
  onRun,
}: {
  receipt: PublicReceipt
  fresh: boolean
  tradeMode: 'paper' | 'live'
  onRun: (run: 'resubmit' | 'poll') => void
}) {
  const next = insufficientAction(receipt)
  return (
    <>
      <TemporalComparator
        state={{ kind: 'result', receipt, mode: modeOf(receipt, fresh) }}
        footer={
          <>
            <ReceiptActions receipt={receipt} surface="inspect" />
            {fresh ? (
              <div className="border-t border-rule">
                <TradePanel receipt={receipt} mode={tradeMode} />
              </div>
            ) : null}
          </>
        }
      />
      {next ? (
        <div className="flex flex-wrap items-center gap-4">
          <p className="t-ui text-ink-soft">
            INSUFFICIENT is an answer, not an error. THEN will not guess.
          </p>
          <ActionButton action={next} onRun={onRun} />
        </div>
      ) : null}
      <p className="t-ui text-meta">{receipt.disclaimer}</p>
    </>
  )
}
