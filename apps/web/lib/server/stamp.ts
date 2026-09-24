import 'server-only'
import {
  claimHash,
  parseClaim,
  randomId,
  type Claim,
  type PublicReceipt,
  type ReasonCode,
} from '@then/core'
import { buildReceipt, type SigningKey } from '@then/receipt'
import { runStamp, type ProgressEvent } from '@then/stamp'
import type { ThenRepository } from '@then/store'
import { after } from 'next/server'
import { getRepo } from './db'
import { env } from './env'
import { hostedSigningKey } from './keys'
import { log, nansen, remainingCredits, spentCredits } from './nansen'
import type { StampEvent } from '@/lib/stamp-events'

export const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000
/** A receipt that failed on an upstream hiccup is not reused: the same claim is stamped again. */
const TRANSIENT_REASONS: ReadonlySet<ReasonCode> = new Set([
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_RATE_LIMIT',
  'UPSTREAM_ERROR',
])
/** Below this, public stamping pauses so one stamp cannot fail halfway for lack of credits. */
export const CREDIT_FLOOR = 25
/** After Nansen rate-limits a stamp, new stamps wait this long instead of adding to the load. */
const RATE_LIMIT_COOLDOWN_MS = 60_000
let coolingUntil = 0

/** Outcomes decided before Nansen is called. */
export type EarlyResult =
  | { kind: 'invalid'; issues: { path: string; message: string }[] }
  | {
      kind: 'unavailable'
      reason: 'NO_API_KEY' | 'NO_SIGNING_KEY' | 'QUOTA_REACHED' | 'UPSTREAM_BUSY'
    }
  | { kind: 'rate_limited'; limit: number }
  | { kind: 'existing'; receipt: PublicReceipt }

function gitSha(): string | null {
  return (
    process.env.THEN_GIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    null
  )
}

type Prepared =
  | { kind: 'early'; result: EarlyResult }
  | {
      kind: 'ready'
      claim: Claim
      hash: string
      jobId: string
      signer: SigningKey
      repo: ThenRepository
    }

/**
 * Everything that must hold before Nansen is called: a valid claim, a key, a signer, the
 * idempotency window, the per-client limit, and the credit floor. Creates the job when all pass.
 */
async function prepare(input: unknown, client: string): Promise<Prepared> {
  const parsed = parseClaim(input)
  if (!parsed.ok) return { kind: 'early', result: { kind: 'invalid', issues: parsed.issues } }
  const claim = parsed.claim
  if (!env.nansenApiKey)
    return { kind: 'early', result: { kind: 'unavailable', reason: 'NO_API_KEY' } }
  const signer = hostedSigningKey()
  if (!signer) return { kind: 'early', result: { kind: 'unavailable', reason: 'NO_SIGNING_KEY' } }

  const repo = await getRepo()
  const hash = claimHash(claim)
  const recent = await repo.findRecentReceipt(hash, new Date(Date.now() - IDEMPOTENCY_WINDOW_MS))
  if (recent && !recent.reasons.some((reason) => TRANSIENT_REASONS.has(reason)))
    return { kind: 'early', result: { kind: 'existing', receipt: recent } }

  const before = await repo.hitRateLimit('stamp', client, 3600)
  if (before >= env.stampsPerHour)
    return { kind: 'early', result: { kind: 'rate_limited', limit: env.stampsPerHour } }

  if (Date.now() < coolingUntil)
    return { kind: 'early', result: { kind: 'unavailable', reason: 'UPSTREAM_BUSY' } }

  const credits = await remainingCredits()
  if (credits !== null && credits < CREDIT_FLOOR)
    return { kind: 'early', result: { kind: 'unavailable', reason: 'QUOTA_REACHED' } }

  const jobId = randomId('job')
  await repo.createJob(jobId, hash, client)
  return { kind: 'ready', claim, hash, jobId, signer, repo }
}

type JobResult =
  { ok: true; receipt: PublicReceipt } | { ok: false; error: 'API_KEY_REJECTED' | 'STAMP_FAILED' }

/** Runs the one shared orchestrator for a prepared job and records how it ended. */
async function runJob(
  job: Extract<Prepared, { kind: 'ready' }>,
  onStage?: (event: ProgressEvent) => void,
): Promise<JobResult> {
  const { claim, hash, jobId, signer, repo } = job
  try {
    const run = await runStamp(claim, {
      client: nansen(),
      onProgress: (event) => {
        onStage?.(event)
        repo.updateJobStage(jobId, event.stage, event.status).catch((error: unknown) => {
          log('warn', { event: 'stamp.progress_write_failed', job: jobId, error: String(error) })
        })
      },
    })
    spentCredits(run.credits_used)
    if (run.layers.some((layer) => layer.error?.kind === 'rate_limit')) {
      coolingUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
      log('warn', {
        event: 'stamp.rate_limited_cooldown',
        job: jobId,
        seconds: RATE_LIMIT_COOLDOWN_MS / 1000,
      })
    }
    if (run.layers.some((layer) => layer.error?.kind === 'auth')) {
      await repo.finishJob(jobId, { error: 'API_KEY_REJECTED' })
      return { ok: false, error: 'API_KEY_REJECTED' }
    }
    const bundle = buildReceipt(run, { origin: 'live_stamp', gitSha: gitSha(), signer })
    await repo.putReceipt(bundle)
    await repo.finishJob(jobId, { receipt_id: bundle.receipt_id })
    await repo.recordEvent(
      bundle.public.verdict === 'INSUFFICIENT' ? 'stamp_insufficient' : 'stamp_completed',
      null,
      {
        chain: claim.chain,
        claim_type: claim.claim_type,
        verdict: bundle.public.verdict,
        credits: run.credits_used,
        method_version: bundle.public.method_version,
      },
    )
    log('info', {
      event: 'stamp.done',
      job: jobId,
      claim_hash: hash,
      verdict: bundle.public.verdict,
      credits: run.credits_used,
    })
    return { ok: true, receipt: bundle.public }
  } catch (error) {
    log('error', {
      event: 'stamp.failed',
      job: jobId,
      error: error instanceof Error ? error.message : String(error),
    })
    const logWriteFailure = (write: string) => (writeError: unknown) =>
      log('error', {
        event: 'stamp.failure_write_failed',
        job: jobId,
        write,
        error: String(writeError),
      })
    await repo.finishJob(jobId, { error: 'STAMP_FAILED' }).catch(logWriteFailure('job'))
    await repo
      .recordEvent('stamp_failed', null, { chain: claim.chain, claim_type: claim.claim_type })
      .catch(logWriteFailure('event'))
    return { ok: false, error: 'STAMP_FAILED' }
  }
}

export type StreamStamp = EarlyResult | { kind: 'stream'; body: ReadableStream<Uint8Array> }

/**
 * Accepts a claim and runs the stamp inside the request, streaming one JSON line per event:
 * accepted, each stage as it resolves, then the receipt or the failure. Hosts that stop work
 * after the response (Cloudflare Workers) keep the stamp alive this way; the browser never
 * computes a verdict. A client that loses the stream can still poll the job by id.
 */
export async function streamStamp(input: unknown, client: string): Promise<StreamStamp> {
  const prepared = await prepare(input, client)
  if (prepared.kind === 'early') return prepared.result
  const encoder = new TextEncoder()
  let open = true
  let finished: Promise<JobResult> | undefined
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: StampEvent) => {
        if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      }
      send({ type: 'accepted', job_id: prepared.jobId })
      finished = runJob(prepared, (event) =>
        send({ type: 'stage', stage: event.stage, status: event.status }),
      ).then((result) => {
        send(
          result.ok
            ? { type: 'done', receipt: result.receipt }
            : { type: 'failed', error: result.error },
        )
        if (open) controller.close()
        open = false
        return result
      })
    },
    cancel() {
      open = false
      // The visitor left; let the stamp finish and record its receipt where the host allows it.
      if (finished) after(finished)
    },
  })
  return { kind: 'stream', body }
}

export type StampNow = EarlyResult | { kind: 'done'; receipt: PublicReceipt } | { kind: 'failed' }

/** The same checks and orchestrator, awaited in the request. For callers that want one answer. */
export async function stampNow(input: unknown, client: string): Promise<StampNow> {
  const prepared = await prepare(input, client)
  if (prepared.kind === 'early') return prepared.result
  const result = await runJob(prepared)
  return result.ok ? { kind: 'done', receipt: result.receipt } : { kind: 'failed' }
}
