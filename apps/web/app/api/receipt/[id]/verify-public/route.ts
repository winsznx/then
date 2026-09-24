import { isReceiptId } from '@then/core'
import { verifyPublic } from '@then/receipt'
import { getRepo } from '@/lib/server/db'
import { handleError, json, problem } from '@/lib/server/http'
import { trustedKeys } from '@/lib/server/keys'

/** Server-side public verification. The same checks run in the browser and in `then verify-public`. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params
    if (!isReceiptId(id)) return problem(404, 'NOT_FOUND', 'No such receipt.')
    const repo = await getRepo()
    const receipt = await repo.getPublicReceipt(id)
    if (!receipt) return problem(404, 'NOT_FOUND', 'No such receipt.')
    const report = verifyPublic(receipt, { trustedKeys: trustedKeys() })
    await repo.recordEvent(report.ok ? 'verification_passed' : 'verification_failed', null, {
      method_version: receipt.method_version,
    })
    return json(report, { headers: { 'x-then-mode': 'replay' } })
  } catch (error) {
    return handleError(error)
  }
}
