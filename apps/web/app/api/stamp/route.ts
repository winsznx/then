import { handleError, json, problem, readJson } from '@/lib/server/http'
import { clientKey } from '@/lib/server/session'
import { streamStamp } from '@/lib/server/stamp'
import { STAMP_STREAM_TYPE } from '@/lib/stamp-events'

export const maxDuration = 60

const UNAVAILABLE: Record<string, [number, string]> = {
  NO_API_KEY: [503, 'This deployment has no Nansen API key, so it cannot stamp.'],
  NO_SIGNING_KEY: [503, 'This deployment has no receipt signing key, so it cannot stamp.'],
  UPSTREAM_BUSY: [503, 'Nansen is rate-limiting requests right now. Try again in a minute.'],
  QUOTA_REACHED: [
    503,
    'The public demo has used its Nansen credits for now. Stored receipts and the Challenge still work.',
  ],
}

/**
 * Starts a stamp. Refusals and a reused receipt come back as JSON; an accepted stamp streams
 * newline-delimited JSON events until its receipt is written.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const result = await streamStamp(await readJson(request), await clientKey())
    switch (result.kind) {
      case 'invalid':
        return problem(422, 'INVALID_CLAIM', 'The claim is incomplete or malformed.', {
          issues: result.issues,
        })
      case 'unavailable': {
        const [status, message] = UNAVAILABLE[result.reason] ?? [
          503,
          'This deployment cannot stamp right now.',
        ]
        return problem(status, result.reason, message)
      }
      case 'rate_limited':
        return problem(
          429,
          'RATE_LIMITED',
          `This deployment allows ${result.limit} stamps per hour per visitor.`,
        )
      case 'existing':
        return json({ status: 'done', receipt: result.receipt, reused: true })
      case 'stream':
        return new Response(result.body, {
          headers: {
            'content-type': `${STAMP_STREAM_TYPE}; charset=utf-8`,
            'cache-control': 'no-store',
            'x-accel-buffering': 'no',
          },
        })
    }
  } catch (error) {
    return handleError(error)
  }
}
