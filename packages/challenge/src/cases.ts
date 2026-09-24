/**
 * Challenge cases are built from frozen public receipts. The game never decides an answer: the
 * answer is the receipt's verdict, read server-side only after a guess is committed.
 */
import {
  hashCanonical,
  randomId,
  sha256Hex,
  type ClaimType,
  type Chain,
  type PublicReceipt,
  type Verdict,
} from '@then/core'
import { randomBytes, bytesToHex } from '@noble/hashes/utils.js'

/** What a player may see before committing: the claim, never the answer. */
export interface ChallengeClaim {
  claim_type: ClaimType
  chain: Chain
  token_symbol: string | null
  token_address: string
  as_of_date: string
  window_hours: number
  /** The public claim sentence, quoted from its source when there is one. */
  quote: string
  source_url: string | null
  source_author: string | null
}

export interface ChallengeCase {
  challenge_id: string
  /** Server-only until reveal: receipt pages are public, so the id would give the answer away. */
  receipt_id: string
  claim: ChallengeClaim
  available_from: string
  daily_key: string | null
  daily_number: number | null
  /** Shown before the guess: sha256 of {receipt_id, salt}. Lets a player check the reveal was fixed in advance. */
  commitment: string
  /** Server-only until reveal. */
  salt: string
  /** Server-only: binds the case to one exact public receipt. */
  integrity_hash: string
  created_at: string
}

export interface CaseEligibility {
  eligible: boolean
  reasons: string[]
}

/**
 * A receipt can back a case only if it is a live stamp (never a fixture), its date settled, its
 * verdict is one of the three public verdicts, and it passed public verification.
 */
export function caseEligibility(receipt: PublicReceipt, verified: boolean): CaseEligibility {
  const reasons: string[] = []
  if (receipt.origin === 'fixture') reasons.push('fixture receipts are never challenge answers')
  if (receipt.evidence.settlement === 'unsettled') reasons.push('claim date not settled')
  if (!['VALID', 'CONTAMINATED', 'INSUFFICIENT'].includes(receipt.verdict))
    reasons.push('not a public verdict')
  if (!verified) reasons.push('receipt failed public verification')
  return { eligible: reasons.length === 0, reasons }
}

/** Recomputed from content, never read from the receipt's own signature field. */
export function receiptFingerprint(receipt: PublicReceipt): string {
  const { signature: _signature, ...content } = receipt
  void _signature
  return hashCanonical(content)
}

export function commitmentOf(receiptId: string, salt: string): string {
  return hashCanonical({ receipt_id: receiptId, salt })
}

export function integrityOf(
  caseCore: Pick<ChallengeCase, 'challenge_id' | 'receipt_id' | 'claim'>,
  receipt: PublicReceipt,
): string {
  return hashCanonical({
    challenge_id: caseCore.challenge_id,
    receipt_id: caseCore.receipt_id,
    receipt: receiptFingerprint(receipt),
    claim: caseCore.claim,
  })
}

export function claimFromReceipt(
  receipt: PublicReceipt,
  source: { quote?: string | null; author?: string | null } = {},
): ChallengeClaim {
  const token = receipt.claim.token_symbol ? `$${receipt.claim.token_symbol}` : 'this token'
  const verb = { SM_BOUGHT: 'bought', SM_SOLD: 'sold', SM_HOLDS: 'held', SM_PERP: 'positioned in' }[
    receipt.claim.claim_type
  ]
  return {
    claim_type: receipt.claim.claim_type,
    chain: receipt.claim.chain,
    token_symbol: receipt.claim.token_symbol ?? null,
    token_address: receipt.claim.token_address,
    as_of_date: receipt.claim.as_of_date,
    window_hours: receipt.claim.window_hours,
    quote: source.quote?.trim() || `Smart Money ${verb} ${token}.`,
    source_url: receipt.claim.source_url ?? null,
    source_author: source.author ?? null,
  }
}

export function createCase(
  receipt: PublicReceipt,
  claim: ChallengeClaim,
  options: { now: string; available_from?: string },
): ChallengeCase {
  const salt = bytesToHex(randomBytes(16))
  const challengeId = randomId('ch')
  const core = { challenge_id: challengeId, receipt_id: receipt.receipt_id, claim }
  return {
    ...core,
    available_from: options.available_from ?? options.now,
    daily_key: null,
    daily_number: null,
    commitment: commitmentOf(receipt.receipt_id, salt),
    salt,
    integrity_hash: integrityOf(core, receipt),
    created_at: options.now,
  }
}

/** Re-checks that a case still points at the exact receipt it was built from. */
export function caseIntegrityHolds(challenge: ChallengeCase, receipt: PublicReceipt): boolean {
  return (
    receipt.receipt_id === challenge.receipt_id &&
    integrityOf(challenge, receipt) === challenge.integrity_hash &&
    commitmentOf(challenge.receipt_id, challenge.salt) === challenge.commitment
  )
}

export interface DailyPick {
  challenge_id: string
  daily_key: string
  daily_number: number
}

interface DailyCandidate {
  challenge_id: string
  verdict: Verdict
  chain: string
  claim_type: string
}

/**
 * Deterministic Daily selection: the verdict class, chain, and claim type least used in the last
 * seven Dailies win, so the game cannot be solved by always picking the dramatic answer. Ties
 * break on a hash of the day and case, so the pick is stable and reproducible for a given pool.
 */
export function pickDaily(
  dayKey: string,
  candidates: readonly DailyCandidate[],
  history: readonly (DailyCandidate & { daily_key: string; daily_number: number })[],
): DailyPick | null {
  const used = new Set(history.map((entry) => entry.challenge_id))
  const pool = candidates.filter((candidate) => !used.has(candidate.challenge_id))
  if (pool.length === 0) return null
  const recent = [...history].sort((a, b) => b.daily_key.localeCompare(a.daily_key)).slice(0, 7)
  const tally = (key: keyof DailyCandidate, value: string) =>
    recent.filter((entry) => entry[key] === value).length
  const ranked = [...pool].sort(
    (a, b) =>
      tally('verdict', a.verdict) - tally('verdict', b.verdict) ||
      tally('chain', a.chain) - tally('chain', b.chain) ||
      tally('claim_type', a.claim_type) - tally('claim_type', b.claim_type) ||
      sha256Hex(`${dayKey}:${a.challenge_id}`).localeCompare(
        sha256Hex(`${dayKey}:${b.challenge_id}`),
      ),
  )
  const number = history.reduce((max, entry) => Math.max(max, entry.daily_number), 0) + 1
  return { challenge_id: ranked[0]!.challenge_id, daily_key: dayKey, daily_number: number }
}
