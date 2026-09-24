import 'server-only'
import { claimHash, parseClaim, randomId, type PublicReceipt, type ReasonCode } from '@then/core'
import { buildReceipt } from '@then/receipt'
import { runStamp } from '@then/stamp'
import { after } from 'next/server'
import { getRepo } from './db'
import { env } from './env'
import { hostedSigningKey } from './keys'
import { log, nansen, remainingCredits, spentCredits } from './nansen'

export const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000
/** A receipt that failed on an upstream hiccup is not reused: the same claim is stamped again. */
const TRANSIENT_REASONS: ReadonlySet<ReasonCode> = new Set([
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_RATE_LIMIT',
  'UPSTREAM_ERROR',
])
/** Below this, public stamping pauses so one stamp cannot fail halfway for lack of credits. */
export const CREDIT_FLOOR = 25

export type StartStamp =
  | { kind: 'invalid'; issues: { path: string; message: string }[] }
  | { kind: 'unavailable'; reason: 'NO_API_KEY' | 'NO_SIGNING_KEY' | 'QUOTA_REACHED' }
  | { kind: 'rate_limited'; limit: number }
  | { kind: 'existing'; receipt: PublicReceipt }
  | { kind: 'started'; job_id: string }

function gitSha(): string | null {
  return (
    process.env.THEN_GIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    null
  )
}

/**
 * Accepts a claim, applies the per-client limit and the idempotency window, and runs the one
 * shared orchestrator after the response. The browser polls the job; it never computes a verdict.
 */
export async function startStamp(input: unknown, client: string): Promise<StartStamp> {
  const parsed = parseClaim(input)
  if (!parsed.ok) return { kind: 'invalid', issues: parsed.issues }
  const claim = parsed.claim
  if (!env.nansenApiKey) return { kind: 'unavailable', reason: 'NO_API_KEY' }
  const signer = hostedSigningKey()
  if (!signer) return { kind: 'unavailable', reason: 'NO_SIGNING_KEY' }

  const repo = await getRepo()
  const hash = claimHash(claim)
  const recent = await repo.findRecentReceipt(hash, new Date(Date.now() - IDEMPOTENCY_WINDOW_MS))
  if (recent && !recent.reasons.some((reason) => TRANSIENT_REASONS.has(reason)))
    return { kind: 'existing', receipt: recent }

  const before = await repo.hitRateLimit('stamp', client, 3600)
  if (before >= env.stampsPerHour) return { kind: 'rate_limited', limit: env.stampsPerHour }

  const credits = await remainingCredits()
  if (credits !== null && credits < CREDIT_FLOOR)
    return { kind: 'unavailable', reason: 'QUOTA_REACHED' }

  const jobId = randomId('job')
  await repo.createJob(jobId, hash, client)
  after(async () => {
    try {
      const run = await runStamp(claim, {
        client: nansen(),
        onProgress: (event) => {
          repo.updateJobStage(jobId, event.stage, event.status).catch((error: unknown) => {
            log('warn', { event: 'stamp.progress_write_failed', job: jobId, error: String(error) })
          })
        },
      })
      spentCredits(run.credits_used)
      const rejected = run.layers.find((layer) => layer.error?.kind === 'auth')
      if (rejected) {
        await repo.finishJob(jobId, { error: 'API_KEY_REJECTED' })
        return
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
    }
  })
  return { kind: 'started', job_id: jobId }
}
