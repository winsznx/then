import { createShare } from '@/lib/server/challenge'
import { getRepo } from '@/lib/server/db'
import { env } from '@/lib/server/env'
import { handleError, json, problem } from '@/lib/server/http'
import { readSession } from '@/lib/server/session'

/** A spoiler-safe card for the player's own result. It says right or wrong, never the verdict. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params
    const session = await readSession()
    if (!session || !/^ch_[a-z2-7]{16}$/.test(id))
      return problem(404, 'NOT_FOUND', 'Nothing to share yet.')
    const share = await createShare(id, session)
    if (!share) return problem(404, 'NOT_FOUND', 'Commit a guess before sharing.')
    await (await getRepo()).recordEvent('receipt_shared', session, { surface: 'challenge' })
    return json({ ...share, url: `${env.publicBaseUrl}/challenge/share/${share.share_id}` })
  } catch (error) {
    return handleError(error)
  }
}
