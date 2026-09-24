import { VERDICTS, addDays, randomId, type PublicReceipt, type Verdict } from '@then/core'
import { caseIntegrityHolds, type ChallengeCase, type ChallengeClaim } from './cases'

export type ChallengeMode = 'daily' | 'archive'

/** The whole pre-guess payload. Nothing here encodes the answer. */
export interface ChallengePrompt {
  challenge_id: string
  mode: ChallengeMode
  daily: { key: string; number: number } | null
  claim: ChallengeClaim
  commitment: string
}

export function promptOf(challenge: ChallengeCase, mode: ChallengeMode): ChallengePrompt {
  return {
    challenge_id: challenge.challenge_id,
    mode,
    daily:
      mode === 'daily' && challenge.daily_key && challenge.daily_number
        ? { key: challenge.daily_key, number: challenge.daily_number }
        : null,
    claim: challenge.claim,
    commitment: challenge.commitment,
  }
}

export interface ChallengeAttempt {
  attempt_id: string
  challenge_id: string
  player_session_id: string
  mode: ChallengeMode
  daily_key: string | null
  guess: Verdict
  committed_at: string
  /** Copied from the canonical receipt at commit time, for audit. */
  actual_verdict: Verdict
  correct: boolean
}

export function isVerdict(value: unknown): value is Verdict {
  return typeof value === 'string' && (VERDICTS as readonly string[]).includes(value)
}

export type CommitOutcome =
  | { ok: true; attempt: ChallengeAttempt; already_committed: boolean }
  | { ok: false; error: 'INVALID_GUESS' | 'CASE_INTEGRITY_FAILED' | 'NOT_AVAILABLE' }

/**
 * Builds the one immutable attempt for a player and case. The answer is the receipt verdict,
 * compared by equality only; if the case no longer matches its receipt, no answer is revealed.
 */
export function commitGuess(input: {
  challenge: ChallengeCase
  receipt: PublicReceipt
  guess: unknown
  session: string
  mode: ChallengeMode
  now: string
  existing: ChallengeAttempt | null
}): CommitOutcome {
  if (input.existing) return { ok: true, attempt: input.existing, already_committed: true }
  if (!isVerdict(input.guess)) return { ok: false, error: 'INVALID_GUESS' }
  if (input.now < input.challenge.available_from) return { ok: false, error: 'NOT_AVAILABLE' }
  if (!caseIntegrityHolds(input.challenge, input.receipt))
    return { ok: false, error: 'CASE_INTEGRITY_FAILED' }
  const actual = input.receipt.verdict
  return {
    ok: true,
    already_committed: false,
    attempt: {
      attempt_id: randomId('att'),
      challenge_id: input.challenge.challenge_id,
      player_session_id: input.session,
      mode: input.mode,
      daily_key: input.mode === 'daily' ? input.challenge.daily_key : null,
      guess: input.guess,
      committed_at: input.now,
      actual_verdict: actual,
      correct: input.guess === actual,
    },
  }
}

export interface Reveal {
  challenge_id: string
  guess: Verdict
  correct: boolean
  verdict: Verdict
  receipt: PublicReceipt
  /** Opens the pre-guess commitment: sha256({receipt_id, salt}) must equal it. */
  opening: { receipt_id: string; salt: string }
}

export function revealOf(
  challenge: ChallengeCase,
  attempt: ChallengeAttempt,
  receipt: PublicReceipt,
): Reveal {
  return {
    challenge_id: challenge.challenge_id,
    guess: attempt.guess,
    correct: attempt.correct,
    verdict: receipt.verdict,
    receipt,
    opening: { receipt_id: challenge.receipt_id, salt: challenge.salt },
  }
}

export interface VerdictTally {
  played: number
  correct: number
}

export interface ChallengeStats {
  daily_played: number
  daily_correct: number
  current_streak: number
  best_streak: number
  archive_played: number
  archive_correct: number
  week_played: number
  week_correct: number
  by_verdict: Record<Verdict, VerdictTally>
}

/**
 * Stats are a pure function of a player's attempts. A Daily streak counts consecutive UTC days
 * with a correct Daily answer; a wrong answer or a missed day ends it. Archive cases count toward
 * accuracy only. Nothing here can touch a verdict.
 */
export function statsOf(attempts: readonly ChallengeAttempt[], today: string): ChallengeStats {
  const by_verdict = Object.fromEntries(
    VERDICTS.map((v) => [v, { played: 0, correct: 0 }]),
  ) as Record<Verdict, VerdictTally>
  for (const attempt of attempts) {
    by_verdict[attempt.actual_verdict].played++
    if (attempt.correct) by_verdict[attempt.actual_verdict].correct++
  }
  const daily = attempts.filter((a) => a.mode === 'daily' && a.daily_key)
  const archive = attempts.filter((a) => a.mode === 'archive')
  const byDay = new Map(daily.map((a) => [a.daily_key!, a.correct]))

  let best = 0
  let run = 0
  for (const day of [...byDay.keys()].sort()) {
    const previous = addDays(day, -1)
    run = byDay.get(day) ? (byDay.get(previous) ? run + 1 : 1) : 0
    best = Math.max(best, run)
  }

  const start = byDay.has(today) ? today : addDays(today, -1)
  let current = 0
  for (let day = start; byDay.get(day) === true; day = addDays(day, -1)) current++

  const weekStart = addDays(today, -6)
  const week = daily.filter((a) => a.daily_key! >= weekStart && a.daily_key! <= today)
  return {
    daily_played: daily.length,
    daily_correct: daily.filter((a) => a.correct).length,
    current_streak: current,
    best_streak: best,
    archive_played: archive.length,
    archive_correct: archive.filter((a) => a.correct).length,
    week_played: week.length,
    week_correct: week.filter((a) => a.correct).length,
    by_verdict,
  }
}

/**
 * Spoiler-safe share lines. They say whether the player was right, never what the verdict was:
 * a friend who has not played today must not learn the answer from a shared card.
 */
export function shareLines(input: {
  daily_number: number | null
  correct: boolean
  streak: number
  week_correct: number
  week_played: number
}): string[] {
  const header = input.daily_number
    ? `THEN / DAILY ${String(input.daily_number).padStart(3, '0')}`
    : 'THEN / ARCHIVE'
  const result = input.correct ? 'CALLED IT.' : 'TODAY GOT ME.'
  const tally =
    input.streak > 1
      ? `${input.streak} DAY STREAK`
      : `${input.week_correct} / ${input.week_played} THIS WEEK`
  return [header, result, tally, 'Would you have admitted the claim?']
}
