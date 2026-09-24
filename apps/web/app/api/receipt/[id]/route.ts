import { isReceiptId } from '@then/core'
import { getRepo } from '@/lib/server/db'
import { handleError, json, problem } from '@/lib/server/http'

/** Stored public receipts are replays of an earlier stamp, never a live result. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params
    if (!isReceiptId(id)) return problem(404, 'NOT_FOUND', 'No such receipt.')
    const receipt = await (await getRepo()).getPublicReceipt(id)
    if (!receipt) return problem(404, 'NOT_FOUND', 'No such receipt.')
    const download = new URL(request.url).searchParams.get('download') === '1'
    return json(receipt, {
      headers: {
        'x-then-mode': 'replay',
        'cache-control': 'public, max-age=300',
        ...(download ? { 'content-disposition': `attachment; filename="${id}.public.json"` } : {}),
      },
    })
  } catch (error) {
    return handleError(error)
  }
}
