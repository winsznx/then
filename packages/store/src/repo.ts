import type { ChallengeAttempt, ChallengeCase, ChallengeClaim } from '@then/challenge'
import { isReceiptId, type PublicReceipt, type Verdict } from '@then/core'
import type { PrivateBundle, ReceiptBundle } from '@then/receipt'
import type { Db } from './db'

export interface StampJob {
  job_id: string
  claim_hash: string
  status: 'running' | 'done' | 'failed'
  stages: Record<string, string>
  receipt_id: string | null
  error: string | null
  created_at: string
  updated_at: string
}

export interface ReceiptListItem {
  receipt_id: string
  verdict: Verdict
  origin: string
  method_version: string
  chain: string
  claim_type: string
  token_symbol: string | null
  as_of_date: string
  generated_at: string
}

export interface CorpusRunRecord {
  run_id: string
  method_version: string
  label: string
  summary: unknown
  created_at: string
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

function day(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

function json<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T
}

/** Every read and write THEN's hosted surfaces make. Private bundles have one reader. */
export class ThenRepository {
  constructor(private readonly db: Db) {}

  async putReceipt(bundle: ReceiptBundle): Promise<void> {
    const receipt = bundle.public
    const privateBundle: PrivateBundle = {
      internal: bundle.internal,
      records: bundle.records,
      payloads: bundle.payloads,
    }
    await this.db.transaction(async (tx) => {
      await tx.query(
        `insert into receipts_public (receipt_id, claim_hash, verdict, origin, method_version, chain, claim_type, token_address, token_symbol, as_of_date, generated_at, public_json)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (receipt_id) do nothing`,
        [
          receipt.receipt_id,
          receipt.claim_hash,
          receipt.verdict,
          receipt.origin,
          receipt.method_version,
          receipt.claim.chain,
          receipt.claim.claim_type,
          receipt.claim.token_address,
          receipt.claim.token_symbol ?? null,
          receipt.claim.as_of_date,
          receipt.generated_at,
          JSON.stringify(receipt),
        ],
      )
      await tx.query(
        `insert into receipts_private (receipt_id, bundle_json, credits_used) values ($1,$2,$3) on conflict (receipt_id) do nothing`,
        [receipt.receipt_id, JSON.stringify(privateBundle), bundle.internal.body.credits_used],
      )
    })
  }

  async getPublicReceipt(receiptId: string): Promise<PublicReceipt | null> {
    if (!isReceiptId(receiptId)) return null
    const rows = await this.db.query<{ public_json: unknown }>(
      'select public_json from receipts_public where receipt_id = $1',
      [receiptId],
    )
    return rows[0] ? json<PublicReceipt>(rows[0].public_json) : null
  }

  /** Authorized callers only: operator tools and the internal evidence route. */
  async getPrivateBundle(receiptId: string): Promise<PrivateBundle | null> {
    if (!isReceiptId(receiptId)) return null
    const rows = await this.db.query<{ bundle_json: unknown }>(
      'select bundle_json from receipts_private where receipt_id = $1',
      [receiptId],
    )
    return rows[0] ? json<PrivateBundle>(rows[0].bundle_json) : null
  }

  async findRecentReceipt(claimHash: string, since: Date): Promise<PublicReceipt | null> {
    const rows = await this.db.query<{ public_json: unknown }>(
      `select public_json from receipts_public where claim_hash = $1 and generated_at >= $2 and origin = 'live_stamp' order by generated_at desc limit 1`,
      [claimHash, since.toISOString()],
    )
    return rows[0] ? json<PublicReceipt>(rows[0].public_json) : null
  }

  async listReceipts(
    options: { origin?: string; limit?: number } = {},
  ): Promise<ReceiptListItem[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `select receipt_id, verdict, origin, method_version, chain, claim_type, token_symbol, as_of_date, generated_at
       from receipts_public ${options.origin ? 'where origin = $2' : ''}
       order by generated_at desc limit $1`,
      options.origin ? [options.limit ?? 50, options.origin] : [options.limit ?? 50],
    )
    return rows.map((row) => ({
      receipt_id: String(row.receipt_id),
      verdict: row.verdict as Verdict,
      origin: String(row.origin),
      method_version: String(row.method_version),
      chain: String(row.chain),
      claim_type: String(row.claim_type),
      token_symbol: (row.token_symbol as string | null) ?? null,
      as_of_date: day(row.as_of_date),
      generated_at: iso(row.generated_at),
    }))
  }

  async featuredReceipt(): Promise<PublicReceipt | null> {
    const rows = await this.db.query<{ public_json: unknown }>(
      `select public_json from receipts_public where featured order by generated_at desc limit 1`,
    )
    return rows[0] ? json<PublicReceipt>(rows[0].public_json) : null
  }

  async setFeatured(receiptId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query('update receipts_public set featured = false where featured')
      await tx.query('update receipts_public set featured = true where receipt_id = $1', [
        receiptId,
      ])
    })
  }

  async createJob(jobId: string, claimHash: string, clientKey: string | null): Promise<void> {
    await this.db.query(
      `insert into stamp_jobs (job_id, claim_hash, status, stages, client_key) values ($1,$2,'running','{}'::jsonb,$3)`,
      [jobId, claimHash, clientKey],
    )
  }

  async updateJobStage(jobId: string, stage: string, status: string): Promise<void> {
    await this.db.query(
      `update stamp_jobs set stages = stages || jsonb_build_object($2::text, $3::text), updated_at = now() where job_id = $1`,
      [jobId, stage, status],
    )
  }

  async finishJob(
    jobId: string,
    result: { receipt_id: string } | { error: string },
  ): Promise<void> {
    if ('receipt_id' in result) {
      await this.db.query(
        `update stamp_jobs set status = 'done', receipt_id = $2, updated_at = now() where job_id = $1`,
        [jobId, result.receipt_id],
      )
    } else {
      await this.db.query(
        `update stamp_jobs set status = 'failed', error = $2, updated_at = now() where job_id = $1`,
        [jobId, result.error],
      )
    }
  }

  async getJob(jobId: string): Promise<StampJob | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      'select * from stamp_jobs where job_id = $1',
      [jobId],
    )
    const row = rows[0]
    if (!row) return null
    return {
      job_id: String(row.job_id),
      claim_hash: String(row.claim_hash),
      status: row.status as StampJob['status'],
      stages: json<Record<string, string>>(row.stages),
      receipt_id: (row.receipt_id as string | null) ?? null,
      error: (row.error as string | null) ?? null,
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
    }
  }

  /** Counts events for a key in a window, then records one. Returns the count before this event. */
  async hitRateLimit(bucket: string, keyHash: string, windowSeconds: number): Promise<number> {
    const rows = await this.db.query<{ count: string | number }>(
      `select count(*) as count from rate_limit_events where bucket = $1 and key_hash = $2 and created_at > now() - ($3::int * interval '1 second')`,
      [bucket, keyHash, windowSeconds],
    )
    await this.db.query('insert into rate_limit_events (bucket, key_hash) values ($1,$2)', [
      bucket,
      keyHash,
    ])
    return Number(rows[0]?.count ?? 0)
  }

  async recordEvent(
    name: string,
    sessionId: string | null,
    props: Record<string, unknown>,
  ): Promise<void> {
    await this.db.query(
      'insert into analytics_events (name, session_id, props) values ($1,$2,$3)',
      [name, sessionId, JSON.stringify(props)],
    )
  }

  async eventCounts(since: Date): Promise<Record<string, number>> {
    const rows = await this.db.query<{ name: string; count: string | number }>(
      'select name, count(*) as count from analytics_events where created_at >= $1 group by name order by name',
      [since.toISOString()],
    )
    return Object.fromEntries(rows.map((row) => [row.name, Number(row.count)]))
  }

  async putCase(challenge: ChallengeCase): Promise<void> {
    await this.db.query(
      `insert into challenge_cases (challenge_id, receipt_id, claim_json, available_from, daily_key, daily_number, commitment, salt, integrity_hash, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (challenge_id) do nothing`,
      [
        challenge.challenge_id,
        challenge.receipt_id,
        JSON.stringify(challenge.claim),
        challenge.available_from,
        challenge.daily_key,
        challenge.daily_number,
        challenge.commitment,
        challenge.salt,
        challenge.integrity_hash,
        challenge.created_at,
      ],
    )
  }

  private caseFrom(row: Record<string, unknown>): ChallengeCase {
    return {
      challenge_id: String(row.challenge_id),
      receipt_id: String(row.receipt_id),
      claim: json<ChallengeClaim>(row.claim_json),
      available_from: iso(row.available_from),
      daily_key: row.daily_key ? day(row.daily_key) : null,
      daily_number:
        row.daily_number === null || row.daily_number === undefined
          ? null
          : Number(row.daily_number),
      commitment: String(row.commitment),
      salt: String(row.salt),
      integrity_hash: String(row.integrity_hash),
      created_at: iso(row.created_at),
    }
  }

  async getCase(challengeId: string): Promise<ChallengeCase | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      'select * from challenge_cases where challenge_id = $1',
      [challengeId],
    )
    return rows[0] ? this.caseFrom(rows[0]) : null
  }

  async getDaily(dayKey: string): Promise<ChallengeCase | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      'select * from challenge_cases where daily_key = $1',
      [dayKey],
    )
    return rows[0] ? this.caseFrom(rows[0]) : null
  }

  async assignDaily(challengeId: string, dayKey: string, dailyNumber: number): Promise<void> {
    await this.db.query(
      'update challenge_cases set daily_key = $2, daily_number = $3 where challenge_id = $1 and daily_key is null',
      [challengeId, dayKey, dailyNumber],
    )
  }

  /** Cases with the verdict of their receipt, for server-side Daily selection only. */
  async casePool(): Promise<(ChallengeCase & { verdict: Verdict })[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `select c.*, r.verdict from challenge_cases c join receipts_public r on r.receipt_id = c.receipt_id order by c.created_at`,
    )
    return rows.map((row) => ({ ...this.caseFrom(row), verdict: row.verdict as Verdict }))
  }

  async listCases(): Promise<ChallengeCase[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      'select * from challenge_cases order by created_at',
    )
    return rows.map((row) => this.caseFrom(row))
  }

  /** Inserts the attempt unless one exists for this player and case; returns the stored one. */
  async commitAttempt(attempt: ChallengeAttempt): Promise<ChallengeAttempt> {
    await this.db.query(
      `insert into challenge_attempts (attempt_id, challenge_id, session_id, mode, daily_key, guess, actual_verdict, correct, committed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (challenge_id, session_id) do nothing`,
      [
        attempt.attempt_id,
        attempt.challenge_id,
        attempt.player_session_id,
        attempt.mode,
        attempt.daily_key,
        attempt.guess,
        attempt.actual_verdict,
        attempt.correct,
        attempt.committed_at,
      ],
    )
    const stored = await this.getAttempt(attempt.challenge_id, attempt.player_session_id)
    if (!stored) throw new Error('attempt was not stored')
    return stored
  }

  private attemptFrom(row: Record<string, unknown>): ChallengeAttempt {
    return {
      attempt_id: String(row.attempt_id),
      challenge_id: String(row.challenge_id),
      player_session_id: String(row.session_id),
      mode: row.mode as ChallengeAttempt['mode'],
      daily_key: row.daily_key ? day(row.daily_key) : null,
      guess: row.guess as Verdict,
      committed_at: iso(row.committed_at),
      actual_verdict: row.actual_verdict as Verdict,
      correct: Boolean(row.correct),
    }
  }

  async getAttempt(challengeId: string, sessionId: string): Promise<ChallengeAttempt | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      'select * from challenge_attempts where challenge_id = $1 and session_id = $2',
      [challengeId, sessionId],
    )
    return rows[0] ? this.attemptFrom(rows[0]) : null
  }

  async listAttempts(sessionId: string): Promise<ChallengeAttempt[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      'select * from challenge_attempts where session_id = $1 order by committed_at',
      [sessionId],
    )
    return rows.map((row) => this.attemptFrom(row))
  }

  async putShare(share: {
    share_id: string
    daily_number: number | null
    correct: boolean
    streak: number
    week_correct: number
    week_played: number
  }): Promise<void> {
    await this.db.query(
      'insert into challenge_shares (share_id, daily_number, correct, streak, week_correct, week_played) values ($1,$2,$3,$4,$5,$6)',
      [
        share.share_id,
        share.daily_number,
        share.correct,
        share.streak,
        share.week_correct,
        share.week_played,
      ],
    )
  }

  async getShare(
    shareId: string,
  ): Promise<{
    daily_number: number | null
    correct: boolean
    streak: number
    week_correct: number
    week_played: number
  } | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      'select * from challenge_shares where share_id = $1',
      [shareId],
    )
    const row = rows[0]
    if (!row) return null
    return {
      daily_number: row.daily_number === null ? null : Number(row.daily_number),
      correct: Boolean(row.correct),
      streak: Number(row.streak),
      week_correct: Number(row.week_correct),
      week_played: Number(row.week_played),
    }
  }

  async putCorpusRun(
    run: { run_id: string; method_version: string; label: string; summary: unknown },
    rows: { claim_id: string; row: unknown; receipt_id: string | null }[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query(
        'insert into corpus_runs (run_id, method_version, label, summary_json) values ($1,$2,$3,$4) on conflict (run_id) do nothing',
        [run.run_id, run.method_version, run.label, JSON.stringify(run.summary)],
      )
      for (const [position, entry] of rows.entries()) {
        await tx.query(
          'insert into corpus_rows (run_id, claim_id, position, row_json, receipt_id) values ($1,$2,$3,$4,$5) on conflict do nothing',
          [run.run_id, entry.claim_id, position, JSON.stringify(entry.row), entry.receipt_id],
        )
      }
    })
  }

  async corpusRuns(): Promise<CorpusRunRecord[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      'select * from corpus_runs order by created_at',
    )
    return rows.map((row) => ({
      run_id: String(row.run_id),
      method_version: String(row.method_version),
      label: String(row.label),
      summary: json<unknown>(row.summary_json),
      created_at: iso(row.created_at),
    }))
  }

  async corpusRows(
    runId: string,
  ): Promise<{ claim_id: string; row: unknown; receipt_id: string | null }[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      'select * from corpus_rows where run_id = $1 order by position',
      [runId],
    )
    return rows.map((row) => ({
      claim_id: String(row.claim_id),
      row: json<unknown>(row.row_json),
      receipt_id: (row.receipt_id as string | null) ?? null,
    }))
  }

  async putRestamp(restampId: string, originalId: string, drift: unknown): Promise<void> {
    await this.db.query(
      'insert into restamps (restamp_receipt_id, original_receipt_id, drift_json) values ($1,$2,$3)',
      [restampId, originalId, JSON.stringify(drift)],
    )
  }

  async restampsOf(
    originalId: string,
  ): Promise<{ restamp_receipt_id: string; drift: unknown; created_at: string }[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      'select * from restamps where original_receipt_id = $1 order by created_at',
      [originalId],
    )
    return rows.map((row) => ({
      restamp_receipt_id: String(row.restamp_receipt_id),
      drift: json<unknown>(row.drift_json),
      created_at: iso(row.created_at),
    }))
  }

  async putTradeIntent(intent: {
    intent_id: string
    receipt_id: string
    mode: string
    payload_hash: string
    request: unknown
  }): Promise<void> {
    await this.db.query(
      'insert into trade_intents (intent_id, receipt_id, mode, payload_hash, request_json) values ($1,$2,$3,$4,$5)',
      [
        intent.intent_id,
        intent.receipt_id,
        intent.mode,
        intent.payload_hash,
        JSON.stringify(intent.request),
      ],
    )
  }
}
