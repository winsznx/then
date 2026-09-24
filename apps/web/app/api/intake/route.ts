import { utcToday } from '@then/core'
import { parseIntake } from '@then/intake'
import { handleError, json, readJson } from '@/lib/server/http'

/** Proposes claim fields from a link or pasted text. Advisory only: the user confirms each field. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await readJson(request, 8192)) as {
      url?: unknown
      text?: unknown
      reference_date?: unknown
    }
    const reference =
      typeof body.reference_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.reference_date)
        ? body.reference_date
        : utcToday()
    const proposal = parseIntake({
      ...(typeof body.url === 'string' ? { url: body.url.slice(0, 2048) } : {}),
      ...(typeof body.text === 'string' ? { text: body.text.slice(0, 2000) } : {}),
      reference_date: reference,
    })
    return json({ proposal })
  } catch (error) {
    return handleError(error)
  }
}
