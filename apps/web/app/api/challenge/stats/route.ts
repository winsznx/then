import { statsFor } from '@/lib/server/challenge'
import { handleError, json } from '@/lib/server/http'
import { readSession } from '@/lib/server/session'

export async function GET(): Promise<Response> {
  try {
    return json({ stats: await statsFor(await readSession()) })
  } catch (error) {
    return handleError(error)
  }
}
