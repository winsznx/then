import { getRepo } from '@/lib/server/db'
import { handleError, json, problem } from '@/lib/server/http'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params
    if (!/^job_[a-z2-7]{16}$/.test(id)) return problem(404, 'NOT_FOUND', 'No such stamp.')
    const repo = await getRepo()
    const job = await repo.getJob(id)
    if (!job) return problem(404, 'NOT_FOUND', 'No such stamp.')
    const receipt = job.receipt_id ? await repo.getPublicReceipt(job.receipt_id) : null
    return json({ status: job.status, stages: job.stages, error: job.error, receipt })
  } catch (error) {
    return handleError(error)
  }
}
