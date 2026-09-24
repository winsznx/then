import { caseView } from '@/lib/server/challenge'
import { getRepo } from '@/lib/server/db'
import { handleError, json, problem } from '@/lib/server/http'
import { readSession } from '@/lib/server/session'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params
    if (!/^ch_[a-z2-7]{16}$/.test(id)) return problem(404, 'NOT_FOUND', 'No such case.')
    const challenge = await (await getRepo()).getCase(id)
    if (!challenge) return problem(404, 'NOT_FOUND', 'No such case.')
    return json(await caseView(challenge, await readSession()))
  } catch (error) {
    return handleError(error)
  }
}
