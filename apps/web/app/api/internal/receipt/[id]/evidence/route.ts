import { isReceiptId } from '@then/core'
import { getRepo } from '@/lib/server/db'
import { authorizeInternal, handleError, json, problem } from '@/lib/server/http'

/** The private evidence bundle. Operator-only: disabled unless enabled, then bearer-token gated. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = authorizeInternal(request)
  if (denied) return denied
  try {
    const { id } = await params
    if (!isReceiptId(id)) return problem(404, 'NOT_FOUND', 'No such receipt.')
    const bundle = await (await getRepo()).getPrivateBundle(id)
    return bundle ? json(bundle) : problem(404, 'NOT_FOUND', 'No such receipt.')
  } catch (error) {
    return handleError(error)
  }
}
