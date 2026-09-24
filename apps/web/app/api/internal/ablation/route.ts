import { isReceiptId } from '@then/core'
import { evaluate, isMethodVersion, project, type SourceRecord } from '@then/engine'
import { getRepo } from '@/lib/server/db'
import { authorizeInternal, handleError, json, problem, readJson } from '@/lib/server/http'

const ASOF_SOURCES = new Set(['asof_trades', 'asof_snapshot', 'asof_flow_summary', 'attribution'])

/** Replays a stored receipt with every point-in-time source removed. Offline; no Nansen calls. */
export async function POST(request: Request): Promise<Response> {
  const denied = authorizeInternal(request)
  if (denied) return denied
  try {
    const body = (await readJson(request, 512)) as { receipt_id?: unknown }
    if (typeof body.receipt_id !== 'string' || !isReceiptId(body.receipt_id))
      return problem(404, 'NOT_FOUND', 'No such receipt.')
    const bundle = await (await getRepo()).getPrivateBundle(body.receipt_id)
    if (!bundle) return problem(404, 'NOT_FOUND', 'No such receipt.')
    const b = bundle.internal.body
    if (!isMethodVersion(b.method_version)) return problem(409, 'UNKNOWN_METHOD', b.method_version)
    const records: SourceRecord[] = bundle.records.map((record) =>
      ASOF_SOURCES.has(record.source)
        ? { source: record.source, status: 'disabled', bodies: [], truncated: false }
        : record,
    )
    const result = evaluate({
      method_version: b.method_version,
      claim: b.claim,
      window: b.window,
      settlement: b.settlement,
      ablation: true,
      surface_available: b.surface_available,
      ...(b.unavailable_reason ? { unavailable_reason: b.unavailable_reason } : {}),
      calibration_window: b.calibration_window,
      projections: project(records, {
        window: b.window,
        chain: b.claim.chain,
        token_address: b.claim.token_address,
      }),
    })
    return json({
      original: b.verdict,
      without_historical: result.verdict,
      reason: result.reasons[0],
    })
  } catch (error) {
    return handleError(error)
  }
}
