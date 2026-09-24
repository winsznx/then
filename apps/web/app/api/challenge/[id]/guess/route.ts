import { submitGuess } from '@/lib/server/challenge'
import { getRepo } from '@/lib/server/db'
import { handleError, json, problem, readJson } from '@/lib/server/http'
import { ensureSession } from '@/lib/server/session'

/** Commits one guess per player and case. A repeat returns the first guess unchanged. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params
    if (!/^ch_[a-z2-7]{16}$/.test(id)) return problem(404, 'NOT_FOUND', 'No such case.')
    const body = (await readJson(request, 1024)) as { guess?: unknown }
    const session = await ensureSession()
    const result = await submitGuess(id, session, body.guess)
    if (!result.ok) return problem(result.status, result.error, 'The guess was not recorded.')
    await (
      await getRepo()
    ).recordEvent(result.reveal.correct ? 'challenge_correct' : 'challenge_answered', session, {
      verdict: result.reveal.verdict,
      correct: result.reveal.correct,
      repeat: result.already_committed,
    })
    return json(result)
  } catch (error) {
    return handleError(error)
  }
}
