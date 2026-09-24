import { loadCorpusView } from '@/lib/server/corpus'
import { handleError, json } from '@/lib/server/http'

export async function GET(): Promise<Response> {
  try {
    return json(await loadCorpusView(), { headers: { 'cache-control': 'public, max-age=60' } })
  } catch (error) {
    return handleError(error)
  }
}
