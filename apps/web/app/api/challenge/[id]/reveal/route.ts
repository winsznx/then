import { caseView } from '@/lib/server/challenge'
import { getRepo } from '@/lib/server/db'
import { handleError, json, problem } from '@/lib/server/http'
import { readSession } from '@/lib/server/session'

/** The reveal exists only for a player who has committed a guess on this case. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params
    const challenge = /^ch_[a-z2-7]{16}$/.test(id) ? await (await getRepo()).getCase(id) : null
    if (!challenge) return problem(404, 'NOT_FOUND', 'No such case.')
    const view = await caseView(challenge, await readSession())
    if (view.kind !== 'revealed')
      return problem(403, 'NOT_COMMITTED', 'Commit a guess before the reveal.')
    return json(view)
  } catch (error) {
    return handleError(error)
  }
}
