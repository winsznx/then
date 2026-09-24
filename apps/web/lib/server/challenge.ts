import 'server-only'
import {
  caseEligibility,
  commitGuess,
  pickDaily,
  promptOf,
  revealOf,
  shareLines,
  statsOf,
  type ChallengeCase,
  type ChallengeMode,
  type ChallengePrompt,
  type ChallengeStats,
  type Reveal,
} from '@then/challenge'
import { randomId, utcToday, type PublicReceipt, type Verdict } from '@then/core'
import { verifyPublic } from '@then/receipt'
import { getRepo } from './db'
import { trustedKeys } from './keys'
import { log } from './nansen'

const verified = new Map<string, boolean>()

/** A receipt backs a case only after public verification against this deployment's keys. */
function receiptVerifies(receipt: PublicReceipt): boolean {
  const cached = verified.get(receipt.receipt_id)
  if (cached !== undefined) return cached
  const ok = verifyPublic(receipt, { trustedKeys: trustedKeys() }).ok
  verified.set(receipt.receipt_id, ok)
  return ok
}

async function eligibleReceipt(challenge: ChallengeCase): Promise<PublicReceipt | null> {
  const receipt = await (await getRepo()).getPublicReceipt(challenge.receipt_id)
  if (!receipt) return null
  return caseEligibility(receipt, receiptVerifies(receipt)).eligible ? receipt : null
}

/** Today's Daily, assigning one if the day has none. Safe when two requests race. */
export async function dailyCase(today = utcToday()): Promise<ChallengeCase | null> {
  const repo = await getRepo()
  const existing = await repo.getDaily(today)
  if (existing) return existing
  const pool = await repo.casePool()
  const eligible: typeof pool = []
  for (const candidate of pool) {
    if (candidate.daily_key === null && (await eligibleReceipt(candidate))) eligible.push(candidate)
  }
  const history = pool
    .filter((c) => c.daily_key !== null && c.daily_number !== null)
    .map((c) => ({
      challenge_id: c.challenge_id,
      verdict: c.verdict,
      chain: c.claim.chain,
      claim_type: c.claim.claim_type,
      daily_key: c.daily_key!,
      daily_number: c.daily_number!,
    }))
  const pick = pickDaily(
    today,
    eligible.map((c) => ({
      challenge_id: c.challenge_id,
      verdict: c.verdict,
      chain: c.claim.chain,
      claim_type: c.claim.claim_type,
    })),
    history,
  )
  if (!pick) return null
  try {
    await repo.assignDaily(pick.challenge_id, pick.daily_key, pick.daily_number)
  } catch (error) {
    log('warn', { event: 'challenge.daily_assign_race', day: today, error: String(error) })
  }
  return repo.getDaily(today)
}

export type CaseView =
  | { kind: 'prompt'; prompt: ChallengePrompt; stats: ChallengeStats | null }
  | { kind: 'revealed'; prompt: ChallengePrompt; reveal: Reveal; stats: ChallengeStats }
  | { kind: 'unavailable' }

function modeOf(challenge: ChallengeCase, today: string): ChallengeMode {
  return challenge.daily_key === today ? 'daily' : 'archive'
}

/**
 * What a player sees for a case. Before their own committed guess: the claim and commitment only.
 * After: the reveal with the frozen receipt.
 */
export async function caseView(
  challenge: ChallengeCase,
  session: string | null,
  today = utcToday(),
): Promise<CaseView> {
  const receipt = await eligibleReceipt(challenge)
  if (!receipt) return { kind: 'unavailable' }
  const prompt = promptOf(challenge, modeOf(challenge, today))
  if (!session) return { kind: 'prompt', prompt, stats: null }
  const repo = await getRepo()
  const attempt = await repo.getAttempt(challenge.challenge_id, session)
  const stats = statsOf(await repo.listAttempts(session), today)
  if (!attempt) return { kind: 'prompt', prompt, stats }
  return { kind: 'revealed', prompt, reveal: revealOf(challenge, attempt, receipt), stats }
}

export type GuessResult =
  | { ok: true; reveal: Reveal; stats: ChallengeStats; already_committed: boolean }
  | { ok: false; status: number; error: string }

export async function submitGuess(
  challengeId: string,
  session: string,
  guess: unknown,
  today = utcToday(),
): Promise<GuessResult> {
  const repo = await getRepo()
  const challenge = await repo.getCase(challengeId)
  if (!challenge) return { ok: false, status: 404, error: 'CASE_NOT_FOUND' }
  const receipt = await eligibleReceipt(challenge)
  if (!receipt) return { ok: false, status: 409, error: 'CASE_INTEGRITY_FAILED' }
  const existing = await repo.getAttempt(challengeId, session)
  const outcome = commitGuess({
    challenge,
    receipt,
    guess,
    session,
    mode: modeOf(challenge, today),
    now: new Date().toISOString(),
    existing,
  })
  if (!outcome.ok)
    return {
      ok: false,
      status: outcome.error === 'INVALID_GUESS' ? 400 : 409,
      error: outcome.error,
    }
  const stored = outcome.already_committed
    ? outcome.attempt
    : await repo.commitAttempt(outcome.attempt)
  const stats = statsOf(await repo.listAttempts(session), today)
  return {
    ok: true,
    reveal: revealOf(challenge, stored, receipt),
    stats,
    already_committed:
      outcome.already_committed || stored.attempt_id !== outcome.attempt.attempt_id,
  }
}

export interface ArchiveRow {
  challenge_id: string
  as_of_date: string
  chain: string
  claim_type: string
  token_symbol: string | null
  daily_number: number | null
  /** Present only for cases this player has committed. */
  played: { correct: boolean; verdict: Verdict } | null
}

export async function archiveFor(session: string | null): Promise<ArchiveRow[]> {
  const repo = await getRepo()
  const cases = await repo.listCases()
  const attempts = session ? await repo.listAttempts(session) : []
  const byCase = new Map(attempts.map((a) => [a.challenge_id, a]))
  const rows: ArchiveRow[] = []
  for (const challenge of cases) {
    if (!(await eligibleReceipt(challenge))) continue
    const attempt = byCase.get(challenge.challenge_id)
    rows.push({
      challenge_id: challenge.challenge_id,
      as_of_date: challenge.claim.as_of_date,
      chain: challenge.claim.chain,
      claim_type: challenge.claim.claim_type,
      token_symbol: challenge.claim.token_symbol,
      daily_number: challenge.daily_number,
      played: attempt ? { correct: attempt.correct, verdict: attempt.actual_verdict } : null,
    })
  }
  return rows.sort((a, b) => b.as_of_date.localeCompare(a.as_of_date))
}

export async function statsFor(
  session: string | null,
  today = utcToday(),
): Promise<ChallengeStats | null> {
  if (!session) return null
  return statsOf(await (await getRepo()).listAttempts(session), today)
}

/** A share card for the player's own result on a case. It never names the verdict. */
export async function createShare(
  challengeId: string,
  session: string,
  today = utcToday(),
): Promise<{ share_id: string; lines: string[] } | null> {
  const repo = await getRepo()
  const challenge = await repo.getCase(challengeId)
  const attempt = challenge ? await repo.getAttempt(challengeId, session) : null
  if (!challenge || !attempt) return null
  const stats = statsOf(await repo.listAttempts(session), today)
  const share = {
    share_id: randomId('sh'),
    daily_number: attempt.mode === 'daily' ? challenge.daily_number : null,
    correct: attempt.correct,
    streak: stats.current_streak,
    week_correct: stats.week_correct,
    week_played: stats.week_played,
  }
  await repo.putShare(share)
  return { share_id: share.share_id, lines: shareLines(share) }
}
