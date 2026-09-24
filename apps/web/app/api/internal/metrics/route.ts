import { getRepo } from '@/lib/server/db'
import { authorizeInternal, handleError, json } from '@/lib/server/http'
import { remainingCredits } from '@/lib/server/nansen'

const DAY_MS = 86_400_000

/** Operator view of product events and the hosted key's credits. Admin token only. */
export async function GET(request: Request): Promise<Response> {
  const denied = authorizeInternal(request)
  if (denied) return denied
  try {
    const repo = await getRepo()
    const now = Date.now()
    return json({
      last_24h: await repo.eventCounts(new Date(now - DAY_MS)),
      last_7d: await repo.eventCounts(new Date(now - 7 * DAY_MS)),
      credits_remaining: await remainingCredits(),
    })
  } catch (error) {
    return handleError(error)
  }
}
