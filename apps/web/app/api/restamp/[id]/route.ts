import { isReceiptId, parseClaim } from '@then/core'
import { buildReceipt, compareReceipts } from '@then/receipt'
import { runStamp } from '@then/stamp'
import { getRepo } from '@/lib/server/db'
import { env } from '@/lib/server/env'
import { handleError, json, problem } from '@/lib/server/http'
import { hostedSigningKey } from '@/lib/server/keys'
import { nansen, remainingCredits } from '@/lib/server/nansen'
import { clientKey } from '@/lib/server/session'
import { CREDIT_FLOOR } from '@/lib/server/stamp'

export const maxDuration = 60

/**
 * Stamps the same claim again as a new receipt and records how it differs. The original receipt
 * is never modified.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params
    if (!isReceiptId(id)) return problem(404, 'NOT_FOUND', 'No such receipt.')
    const repo = await getRepo()
    const original = await repo.getPrivateBundle(id)
    if (!original) return problem(404, 'NOT_FOUND', 'No such receipt.')
    const signer = hostedSigningKey()
    if (!env.nansenApiKey || !signer)
      return problem(503, 'UNAVAILABLE', 'This deployment cannot stamp.')
    if ((await repo.hitRateLimit('stamp', await clientKey(), 3600)) >= env.stampsPerHour)
      return problem(429, 'RATE_LIMITED', 'Too many stamps this hour.')
    const credits = await remainingCredits()
    if (credits !== null && credits < CREDIT_FLOOR)
      return problem(503, 'QUOTA_REACHED', 'The public demo has used its Nansen credits for now.')
    const claim = parseClaim(original.internal.body.claim)
    if (!claim.ok) return problem(409, 'INVALID_CLAIM', 'The stored claim no longer parses.')

    const run = await runStamp(claim.claim, { client: nansen() })
    const bundle = buildReceipt(run, {
      origin: 'restamp',
      gitSha: process.env.THEN_GIT_SHA ?? null,
      signer,
      restampOf: id,
    })
    await repo.putReceipt(bundle)
    const drift = compareReceipts(original.internal, bundle.internal)
    await repo.putRestamp(bundle.receipt_id, id, drift)
    return json({ receipt: bundle.public, drift })
  } catch (error) {
    return handleError(error)
  }
}
