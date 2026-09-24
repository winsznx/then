import { archiveFor } from '@/lib/server/challenge'
import { handleError, json } from '@/lib/server/http'
import { readSession } from '@/lib/server/session'

/** Case list. Verdicts appear only on rows this player has already committed. */
export async function GET(): Promise<Response> {
  try {
    return json({ cases: await archiveFor(await readSession()) })
  } catch (error) {
    return handleError(error)
  }
}
