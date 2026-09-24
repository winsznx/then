import { canonicalize, hashCanonical, type PublicReceipt } from '@then/core'
import { SCENARIOS, runFromScenario } from '@then/fixtures'
import { FIXTURE_SIGNING_KEY, buildReceipt, redistributionFindings } from '@then/receipt'
import { describe, expect, it } from 'vitest'
import {
  caseEligibility,
  caseIntegrityHolds,
  claimFromReceipt,
  commitGuess,
  createCase,
  pickDaily,
  promptOf,
  revealOf,
  shareLines,
  statsOf,
  type ChallengeAttempt,
} from '../src'

const NOW = '2026-09-24T12:00:00.000Z'

function receiptFor(id: string) {
  const bundle = buildReceipt(runFromScenario(SCENARIOS.find((s) => s.id === id)!), {
    origin: 'fixture',
    gitSha: null,
    signer: FIXTURE_SIGNING_KEY,
  })
  return bundle
}

function caseFor(id = 'P1') {
  const bundle = receiptFor(id)
  const challenge = createCase(bundle.public, claimFromReceipt(bundle.public), { now: NOW })
  return { bundle, receipt: bundle.public, challenge }
}

describe('pre-guess payload', () => {
  it('contains no receipt id, verdict, support states, reasons, or explanation', () => {
    // #given
    const { receipt, challenge } = caseFor('P1')
    // #when
    const text = canonicalize(promptOf(challenge, 'daily'))
    // #then
    const leaks = [
      receipt.receipt_id,
      receipt.verdict,
      receipt.comparison.public_explanation,
      'asof_support',
      'live_label',
      'decision_inputs',
      'reasons',
      challenge.salt,
      ...receipt.reasons,
    ].filter((secret) => text.includes(secret))
    expect(leaks).toEqual([])
  })

  it('is identical in shape for every verdict class, so field presence cannot hint the answer', () => {
    // #given
    const shapes = ['P1', 'P2', 'neither'].map((id) =>
      Object.keys(promptOf(caseFor(id).challenge, 'archive'))
        .sort()
        .join(','),
    )
    // #then
    expect(new Set(shapes).size).toBe(1)
  })
})

describe('commitGuess', () => {
  it('stores the canonical receipt verdict byte-for-byte as the answer', () => {
    // #given
    const { receipt, challenge } = caseFor('P1')
    // #when
    const outcome = commitGuess({
      challenge,
      receipt,
      guess: 'VALID',
      session: 'ses_a',
      mode: 'archive',
      now: NOW,
      existing: null,
    })
    // #then
    expect(outcome.ok && outcome.attempt.actual_verdict).toBe(receipt.verdict)
  })

  it('marks a matching guess correct', () => {
    // #given
    const { receipt, challenge } = caseFor('P1')
    // #when
    const outcome = commitGuess({
      challenge,
      receipt,
      guess: receipt.verdict,
      session: 'ses_a',
      mode: 'archive',
      now: NOW,
      existing: null,
    })
    // #then
    expect(outcome.ok && outcome.attempt.correct).toBe(true)
  })

  it('returns the first attempt unchanged when the same player commits again', () => {
    // #given
    const { receipt, challenge } = caseFor('P1')
    const first = commitGuess({
      challenge,
      receipt,
      guess: 'VALID',
      session: 'ses_a',
      mode: 'daily',
      now: NOW,
      existing: null,
    })
    if (!first.ok) throw new Error('first commit failed')
    // #when
    const second = commitGuess({
      challenge,
      receipt,
      guess: 'CONTAMINATED',
      session: 'ses_a',
      mode: 'daily',
      now: NOW,
      existing: first.attempt,
    })
    // #then
    expect(second).toEqual({ ok: true, attempt: first.attempt, already_committed: true })
  })

  it('rejects anything but the three verdict words', () => {
    // #given
    const { receipt, challenge } = caseFor('P1')
    // #when
    const outcome = commitGuess({
      challenge,
      receipt,
      guess: 'MAYBE',
      session: 'ses_a',
      mode: 'daily',
      now: NOW,
      existing: null,
    })
    // #then
    expect(outcome).toEqual({ ok: false, error: 'INVALID_GUESS' })
  })

  it('reveals nothing when the case no longer matches its receipt', () => {
    // #given
    const { receipt, challenge } = caseFor('P1')
    const tampered: PublicReceipt = { ...receipt, verdict: 'VALID' }
    // #when
    const outcome = commitGuess({
      challenge,
      receipt: tampered,
      guess: 'VALID',
      session: 'ses_a',
      mode: 'daily',
      now: NOW,
      existing: null,
    })
    // #then
    expect(outcome).toEqual({ ok: false, error: 'CASE_INTEGRITY_FAILED' })
  })

  it('refuses guesses before the case opens', () => {
    // #given
    const { receipt } = caseFor('P1')
    const challenge = createCase(receipt, claimFromReceipt(receipt), {
      now: NOW,
      available_from: '2026-09-25T00:00:00.000Z',
    })
    // #when
    const outcome = commitGuess({
      challenge,
      receipt,
      guess: 'VALID',
      session: 'ses_a',
      mode: 'daily',
      now: NOW,
      existing: null,
    })
    // #then
    expect(outcome).toEqual({ ok: false, error: 'NOT_AVAILABLE' })
  })
})

describe('reveal', () => {
  it('opens the commitment shown before the guess', () => {
    // #given
    const { receipt, challenge } = caseFor('P2')
    const outcome = commitGuess({
      challenge,
      receipt,
      guess: 'VALID',
      session: 'ses_a',
      mode: 'archive',
      now: NOW,
      existing: null,
    })
    if (!outcome.ok) throw new Error('commit failed')
    // #when
    const reveal = revealOf(challenge, outcome.attempt, receipt)
    // #then
    expect(hashCanonical(reveal.opening)).toBe(challenge.commitment)
  })

  it('carries only the public receipt, which passes the redistribution check', () => {
    // #given
    const { bundle, receipt, challenge } = caseFor('P1')
    const outcome = commitGuess({
      challenge,
      receipt,
      guess: 'VALID',
      session: 'ses_a',
      mode: 'archive',
      now: NOW,
      existing: null,
    })
    if (!outcome.ok) throw new Error('commit failed')
    // #when
    const reveal = revealOf(challenge, outcome.attempt, receipt)
    // #then
    expect(redistributionFindings(reveal, bundle)).toEqual([])
  })
})

describe('case integrity', () => {
  it('holds for an untouched case', () => {
    // #given
    const { receipt, challenge } = caseFor('P2')
    // #then
    expect(caseIntegrityHolds(challenge, receipt)).toBe(true)
  })

  it('fails when the case is pointed at another receipt', () => {
    // #given
    const { challenge } = caseFor('P2')
    const other = receiptFor('P1').public
    // #then
    expect(caseIntegrityHolds({ ...challenge, receipt_id: other.receipt_id }, other)).toBe(false)
  })

  it('never accepts fixture receipts as answers', () => {
    // #given
    const { receipt } = caseFor('P2')
    // #then
    expect(caseEligibility(receipt, true).eligible).toBe(false)
  })
})

describe('pickDaily', () => {
  const candidates = [
    {
      challenge_id: 'ch_a',
      verdict: 'CONTAMINATED' as const,
      chain: 'solana',
      claim_type: 'SM_BOUGHT',
    },
    { challenge_id: 'ch_b', verdict: 'VALID' as const, chain: 'ethereum', claim_type: 'SM_BOUGHT' },
    {
      challenge_id: 'ch_c',
      verdict: 'INSUFFICIENT' as const,
      chain: 'base',
      claim_type: 'SM_HOLDS',
    },
  ]

  it('is stable for a UTC day', () => {
    // #when
    const first = pickDaily('2026-09-24', candidates, [])
    const second = pickDaily('2026-09-24', [...candidates].reverse(), [])
    // #then
    expect(second).toEqual(first)
  })

  it('prefers the verdict class least used in the last week', () => {
    // #given
    const history = [
      { ...candidates[0]!, challenge_id: 'ch_old1', daily_key: '2026-09-22', daily_number: 1 },
      { ...candidates[1]!, challenge_id: 'ch_old2', daily_key: '2026-09-23', daily_number: 2 },
    ]
    // #when
    const pick = pickDaily('2026-09-24', candidates, history)
    // #then
    expect(pick).toEqual({ challenge_id: 'ch_c', daily_key: '2026-09-24', daily_number: 3 })
  })

  it('never repeats a past Daily', () => {
    // #given
    const history = candidates.map((c, i) => ({
      ...c,
      daily_key: `2026-09-2${i}`,
      daily_number: i + 1,
    }))
    // #then
    expect(pickDaily('2026-09-24', candidates, history)).toBeNull()
  })
})

describe('statsOf', () => {
  function daily(day: string, correct: boolean): ChallengeAttempt {
    return {
      attempt_id: `att_${day}`,
      challenge_id: `ch_${day}`,
      player_session_id: 'ses_a',
      mode: 'daily',
      daily_key: day,
      guess: 'VALID',
      committed_at: `${day}T10:00:00Z`,
      actual_verdict: correct ? 'VALID' : 'CONTAMINATED',
      correct,
    }
  }

  it('counts consecutive correct Dailies up to today', () => {
    // #given
    const attempts = [
      daily('2026-09-21', true),
      daily('2026-09-22', true),
      daily('2026-09-23', true),
      daily('2026-09-24', true),
    ]
    // #then
    expect(statsOf(attempts, '2026-09-24').current_streak).toBe(4)
  })

  it('keeps yesterday’s streak alive until today is played', () => {
    // #given
    const attempts = [daily('2026-09-22', true), daily('2026-09-23', true)]
    // #then
    expect(statsOf(attempts, '2026-09-24').current_streak).toBe(2)
  })

  it('ends the streak on a wrong answer and remembers the best run', () => {
    // #given
    const attempts = [
      daily('2026-09-20', true),
      daily('2026-09-21', true),
      daily('2026-09-22', true),
      daily('2026-09-23', false),
      daily('2026-09-24', true),
    ]
    // #when
    const stats = statsOf(attempts, '2026-09-24')
    // #then
    expect({ current: stats.current_streak, best: stats.best_streak }).toEqual({
      current: 1,
      best: 3,
    })
  })

  it('ends the streak on a missed day', () => {
    // #given
    const attempts = [daily('2026-09-20', true), daily('2026-09-22', true)]
    // #then
    expect(statsOf(attempts, '2026-09-24').current_streak).toBe(0)
  })

  it('does not change any attempt it reads', () => {
    // #given
    const attempts = [daily('2026-09-23', true), daily('2026-09-24', false)]
    const before = canonicalize(attempts)
    // #when
    statsOf(attempts, '2026-09-24')
    // #then
    expect(canonicalize(attempts)).toBe(before)
  })
})

describe('shareLines', () => {
  it('never names a verdict, whatever the result', () => {
    // #given
    const lines = [true, false].flatMap((correct) =>
      shareLines({ daily_number: 14, correct, streak: 4, week_correct: 3, week_played: 5 }),
    )
    // #then
    expect(lines.join(' ')).not.toMatch(/VALID|CONTAMINATED|INSUFFICIENT/)
  })
})
