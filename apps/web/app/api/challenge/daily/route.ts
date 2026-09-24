import { caseView, dailyCase } from '@/lib/server/challenge'
import { handleError, json } from '@/lib/server/http'
import { readSession } from '@/lib/server/session'

/** Today's case. Before this player's own committed guess the payload has no answer in it. */
export async function GET(): Promise<Response> {
  try {
    const challenge = await dailyCase()
    if (!challenge) return json({ kind: 'empty' })
    return json(await caseView(challenge, await readSession()))
  } catch (error) {
    return handleError(error)
  }
}
