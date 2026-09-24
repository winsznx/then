'use client'

import type { ChallengePrompt, ChallengeStats, Reveal } from '@then/challenge'
import { VERDICTS, VERDICT_HEADLINES, hashCanonical, type Verdict } from '@then/core'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { TemporalComparator } from '@/components/inspect/temporal-comparator'
import { VERDICT_MEANING, VERDICT_STYLE, VerdictWord } from '@/components/verdict/verdict'
import { api } from '@/lib/client/api'
import { track } from '@/lib/client/track'
import { chainName, claimTypeName, formatDay } from '@/lib/format'
import { ClaimSentence } from '@/components/verdict/claim-sentence'
import { StatsLedger } from './stats-ledger'

interface GuessResponse {
  ok: true
  reveal: Reveal
  stats: ChallengeStats
  already_committed: boolean
}

const GUESS_ERRORS: Record<string, string> = {
  CASE_INTEGRITY_FAILED:
    'This case no longer matches its frozen receipt, so THEN will not reveal an answer for it. Try another case.',
  NOT_AVAILABLE: 'This case is not open yet.',
  SESSION_UNAVAILABLE: 'This deployment cannot record answers right now.',
}

function dailyLabel(prompt: ChallengePrompt): string {
  return prompt.daily
    ? `THEN / DAILY ${String(prompt.daily.number).padStart(3, '0')}`
    : 'THEN / ARCHIVE'
}

/**
 * One case, one immutable answer. Before the commit the page holds only the claim and a hash that
 * commits to the answer; the verdict, support states, and receipt arrive in the commit response.
 */
export function ChallengeGame({
  prompt,
  initialReveal,
  initialStats,
}: {
  prompt: ChallengePrompt
  initialReveal: Reveal | null
  initialStats: ChallengeStats | null
}) {
  const [selected, setSelected] = useState<Verdict | null>(null)
  const [reveal, setReveal] = useState<Reveal | null>(initialReveal)
  const [stats, setStats] = useState<ChallengeStats | null>(initialStats)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shownAt] = useState(() => Date.now())
  const revealHeading = useRef<HTMLHeadingElement>(null)
  const groupId = useId()
  const { claim } = prompt

  useEffect(() => {
    if (!initialReveal) track('challenge_started', { mode: prompt.mode, chain: prompt.claim.chain })
  }, [initialReveal, prompt.mode, prompt.claim.chain])

  async function commit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || committing) return
    setCommitting(true)
    setError(null)
    track('challenge_selected', { mode: prompt.mode, decision_ms: Date.now() - shownAt })
    const result = await api<GuessResponse>(`/api/challenge/${prompt.challenge_id}/guess`, {
      method: 'POST',
      json: { guess: selected },
    })
    setCommitting(false)
    if (!result.ok) {
      setError(
        GUESS_ERRORS[result.code] ?? 'Your answer was not recorded. Nothing was scored; try again.',
      )
      return
    }
    setReveal(result.data.reveal)
    setStats(result.data.stats)
    requestAnimationFrame(() => revealHeading.current?.focus())
  }

  return (
    <div>
      <div className="t-meta flex flex-wrap items-baseline justify-between gap-3">
        <span className="font-medium text-ink">{dailyLabel(prompt)}</span>
        {stats && stats.current_streak > 0 ? <span>{stats.current_streak} DAY STREAK</span> : null}
      </div>

      <h1 className="t-ui mt-8 font-medium text-ink md:mt-12">
        Would you have admitted this claim?
      </h1>
      <blockquote className="mt-4">
        <p className="font-display text-[34px] leading-[1.08] tracking-[-0.015em] text-ink md:text-[52px] xl:text-[60px]">
          “{claim.quote}”
        </p>
        <footer className="t-ui mt-5 text-ink-soft">
          {claim.source_author ? <>{claim.source_author}</> : 'Published claim'}
          {claim.source_url ? (
            <>
              {' · '}
              <a
                href={claim.source_url}
                rel="noreferrer nofollow"
                className="underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
              >
                Source
              </a>
            </>
          ) : null}
        </footer>
      </blockquote>
      <p className="t-meta mt-6">
        THEN checks: <ClaimSentence claim={claim} /> · {chainName(claim.chain)} ·{' '}
        {formatDay(claim.as_of_date)}
        {claim.window_hours > 24 ? ` (${claim.window_hours / 24}-day window)` : ''} ·{' '}
        {claimTypeName(claim.claim_type)}
      </p>

      {reveal ? (
        <RevealView prompt={prompt} reveal={reveal} stats={stats} headingRef={revealHeading} />
      ) : (
        <form onSubmit={commit} className="mt-10 md:mt-14">
          <fieldset aria-describedby={`${groupId}-note`}>
            <legend className="sr-only">Your verdict</legend>
            <div className="border-t border-rule">
              {VERDICTS.map((verdict) => {
                const checked = selected === verdict
                return (
                  <label
                    key={verdict}
                    className={`group relative flex min-h-[72px] cursor-pointer flex-col items-start justify-center gap-1 border-b border-rule px-1 py-4 transition-colors duration-[var(--dur-fast)] md:flex-row md:items-center md:justify-start md:gap-8 md:py-5 ${
                      checked ? 'bg-workspace' : 'hover:bg-workspace'
                    }`}
                  >
                    <input
                      type="radio"
                      name="verdict"
                      value={verdict}
                      checked={checked}
                      onChange={() => setSelected(verdict)}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`absolute top-0 bottom-0 left-0 w-[3px] ${
                        checked
                          ? 'bg-ink'
                          : 'bg-transparent group-hover:bg-rule-strong peer-focus-visible:bg-time'
                      }`}
                    />
                    <span className="t-verdict shrink-0 pl-4 text-[20px] text-ink md:w-[13ch] md:text-[26px]">
                      {verdict}
                    </span>
                    <span className="t-ui pl-4 text-ink-soft md:pl-0">
                      {VERDICT_MEANING[verdict]}
                    </span>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[-2px] peer-focus-visible:outline-time"
                    />
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div
            className={`mt-6 flex flex-wrap items-center gap-4 ${
              selected
                ? 'max-md:sticky max-md:bottom-0 max-md:-mx-[var(--inset)] max-md:border-t max-md:border-rule max-md:bg-canvas max-md:px-[var(--inset)] max-md:py-3'
                : ''
            }`}
          >
            <button
              type="submit"
              disabled={!selected || committing}
              className="t-ui inline-flex h-12 items-center rounded-md bg-ink px-5 text-[15px] font-medium text-white transition-colors duration-[var(--dur-fast)] hover:bg-ink-soft disabled:bg-band disabled:text-meta max-md:flex-1 max-md:justify-center"
            >
              {committing ? 'Committing…' : selected ? `Commit ${selected}` : 'Commit answer'}
            </button>
            <p
              className={`t-ui text-ink-soft ${selected ? 'max-md:hidden' : ''}`}
              aria-live="polite"
            >
              {selected
                ? `${selected} selected. Committing is final.`
                : 'Choose once. Then THEN reveals what was knowable then.'}
            </p>
          </div>
          {error ? (
            <p role="alert" className="t-ui mt-4 font-medium text-ink">
              {error}
            </p>
          ) : null}
          <p id={`${groupId}-note`} className="t-meta mt-8 max-w-[70ch] break-all">
            Answer fixed before you choose: {prompt.commitment}
          </p>
        </form>
      )}
    </div>
  )
}

function RevealView({
  prompt,
  reveal,
  stats,
  headingRef,
}: {
  prompt: ChallengePrompt
  reveal: Reveal
  stats: ChallengeStats | null
  headingRef: React.RefObject<HTMLHeadingElement | null>
}) {
  const router = useRouter()
  const [share, setShare] = useState<
    | { kind: 'idle' }
    | { kind: 'working' }
    | { kind: 'copied'; url: string }
    | { kind: 'error'; message: string }
  >({
    kind: 'idle',
  })
  const [finding, setFinding] = useState(false)
  const opened = hashCanonical(reveal.opening) === prompt.commitment

  async function shareResult() {
    track('challenge_share_clicked', { mode: prompt.mode })
    setShare({ kind: 'working' })
    const result = await api<{ share_id: string; lines: string[]; url: string }>(
      `/api/challenge/${prompt.challenge_id}/share`,
      {
        method: 'POST',
      },
    )
    if (!result.ok) {
      setShare({ kind: 'error', message: result.message })
      return
    }
    const { url, lines } = result.data
    const data = { title: lines[0] ?? 'THEN', text: lines.join('\n'), url }
    if (typeof navigator.share === 'function' && navigator.canShare?.(data) !== false) {
      try {
        await navigator.share(data)
        setShare({ kind: 'idle' })
        return
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === 'AbortError') {
          setShare({ kind: 'idle' })
          return
        }
        console.warn('share sheet failed, copying instead', reason)
      }
    }
    try {
      await navigator.clipboard.writeText(`${lines.join('\n')}\n${url}`)
      setShare({ kind: 'copied', url })
    } catch (reason) {
      console.warn('clipboard unavailable', reason)
      setShare({ kind: 'copied', url })
    }
  }

  async function playAnother() {
    setFinding(true)
    const result = await api<{ cases: { challenge_id: string; played: unknown }[] }>(
      '/api/challenge/archive',
    )
    setFinding(false)
    const next = result.ok
      ? result.data.cases.find((row) => !row.played && row.challenge_id !== prompt.challenge_id)
      : undefined
    track('challenge_replayed', { mode: prompt.mode })
    router.push(next ? `/challenge/archive/${next.challenge_id}` : '/challenge/archive')
  }

  const action =
    't-ui inline-flex h-11 items-center rounded-md border border-rule-strong px-4 text-ink transition-colors duration-[var(--dur-fast)] hover:bg-band'

  return (
    <section aria-labelledby="reveal-heading" className="animate-resolve mt-10 md:mt-14">
      <h2 id="reveal-heading" ref={headingRef} tabIndex={-1} className="sr-only">
        {reveal.correct ? 'Correct.' : 'Not this time.'} You said {reveal.guess}. THEN stamped{' '}
        {reveal.verdict}.
      </h2>
      <div className="grid grid-cols-2 border-y border-rule">
        <div className="border-r border-rule py-6 pr-4 md:py-8">
          <p className="t-meta">You said</p>
          <p className="relative mt-2 inline-block text-[26px] leading-none md:text-[44px]">
            <span className="t-verdict text-ink">{reveal.guess}</span>
            {reveal.correct ? null : (
              <span
                aria-hidden="true"
                className="absolute top-1/2 right-[-4px] left-[-4px] h-px bg-ink"
              />
            )}
          </p>
          {reveal.correct ? (
            <div aria-hidden="true" className="animate-rule mt-4 h-[2px] w-24 bg-valid" />
          ) : null}
        </div>
        <div className="py-6 pl-4 md:py-8 md:pl-8">
          <p className="t-meta">THEN stamped</p>
          <p className="animate-stamp mt-2 text-[26px] leading-none md:text-[44px]">
            <VerdictWord verdict={reveal.verdict} />
          </p>
        </div>
      </div>
      <p className="t-h3 mt-6">{reveal.correct ? 'Correct.' : 'Not this time.'}</p>

      <div className="mt-8">
        <TemporalComparator
          state={{ kind: 'result', receipt: reveal.receipt, mode: 'replay' }}
          showVerdict={false}
        />
      </div>

      <div className={`mt-6 rounded-lg px-5 py-5 md:px-8 ${VERDICT_STYLE[reveal.verdict].wash}`}>
        <p className="t-lead !text-ink">{VERDICT_HEADLINES[reveal.verdict]}</p>
        <p className="t-ui mt-2 text-ink-soft">{reveal.receipt.comparison.public_explanation}</p>
      </div>

      <p className="t-ui mt-4 text-ink-soft">
        {opened
          ? `The answer was fixed before you chose: sha256 of receipt ${reveal.opening.receipt_id} and its salt matches the hash shown with the claim.`
          : 'The commitment shown before you chose does not open to this receipt. Treat this case as unreliable.'}
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link
          href={`/r/${reveal.receipt.receipt_id}`}
          className="t-ui inline-flex h-11 items-center rounded-md bg-ink px-4 font-medium text-white transition-colors duration-[var(--dur-fast)] hover:bg-ink-soft"
          onClick={() => track('receipt_opened', { surface: 'challenge', verdict: reveal.verdict })}
        >
          Open full receipt
        </Link>
        <button
          type="button"
          className={action}
          onClick={shareResult}
          disabled={share.kind === 'working'}
        >
          {share.kind === 'working' ? 'Preparing…' : 'Share result'}
        </button>
        <button type="button" className={action} onClick={playAnother} disabled={finding}>
          {finding ? 'Finding a case…' : 'Play another case'}
        </button>
        <Link href="/method#verdicts" className={action}>
          How THEN decides
        </Link>
      </div>
      <p className="t-ui mt-3 text-ink-soft" aria-live="polite">
        {share.kind === 'copied'
          ? `Copied a spoiler-free result and ${share.url}`
          : share.kind === 'error'
            ? share.message
            : ''}
      </p>

      {stats ? <StatsLedger stats={stats} /> : null}
    </section>
  )
}
