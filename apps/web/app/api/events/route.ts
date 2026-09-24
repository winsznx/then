import { getRepo } from '@/lib/server/db'
import { handleError, json, readJson } from '@/lib/server/http'
import { readSession } from '@/lib/server/session'

/** Product events only. Names and property keys are allow-listed; free text never gets through. */
const EVENTS = new Set([
  'landing_view',
  'inspect_opened',
  'example_loaded',
  'claim_submitted',
  'stamp_started',
  'provenance_opened',
  'receipt_opened',
  'receipt_shared',
  'receipt_downloaded',
  'public_verify_run',
  'corpus_opened',
  'method_opened',
  'challenge_started',
  'challenge_selected',
  'challenge_replayed',
  'challenge_share_clicked',
  'archive_opened',
  'trade_prepare_attempted',
])

const PROPS = new Set([
  'chain',
  'claim_type',
  'verdict',
  'mode',
  'surface',
  'latency_bucket',
  'method_version',
  'decision_ms',
])

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await readJson(request, 2048)) as { name?: unknown; props?: unknown }
    if (typeof body.name !== 'string' || !EVENTS.has(body.name))
      return json({ ok: false }, { status: 202 })
    const props: Record<string, string | number | boolean> = {}
    if (body.props && typeof body.props === 'object') {
      for (const [key, value] of Object.entries(body.props as Record<string, unknown>)) {
        if (!PROPS.has(key)) continue
        if (typeof value === 'number' || typeof value === 'boolean') props[key] = value
        else if (typeof value === 'string') props[key] = value.slice(0, 48)
      }
    }
    await (await getRepo()).recordEvent(body.name, await readSession(), props)
    return json({ ok: true }, { status: 202 })
  } catch (error) {
    return handleError(error)
  }
}
