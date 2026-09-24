import { utcToday } from '@then/core'
import { dailyCase } from '@/lib/server/challenge'
import { authorizeInternal, handleError, json } from '@/lib/server/http'

/** Scheduled job: fixes today's Daily ahead of the first visitor. Idempotent. */
export async function POST(request: Request): Promise<Response> {
  const denied = authorizeInternal(request)
  if (denied) return denied
  try {
    const today = utcToday()
    const daily = await dailyCase(today)
    return json({
      day: today,
      challenge_id: daily?.challenge_id ?? null,
      daily_number: daily?.daily_number ?? null,
    })
  } catch (error) {
    return handleError(error)
  }
}
