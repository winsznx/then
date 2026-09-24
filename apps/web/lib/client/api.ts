export interface ApiProblem {
  ok: false
  status: number
  code: string
  message: string
  issues?: { path: string; message: string }[]
}

export type ApiResult<T> = { ok: true; status: number; data: T } | ApiProblem

const OFFLINE: Omit<ApiProblem, 'status'> = {
  ok: false,
  code: 'NETWORK_ERROR',
  message: 'THEN could not reach its server. Check your connection and try again.',
}

/**
 * Same-origin JSON calls. Every failure comes back as a value with a code the UI can map to one
 * next action, so no caller needs its own try/catch.
 */
export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<ApiResult<T>> {
  const { json, ...rest } = init
  let response: Response
  try {
    response = await fetch(path, {
      ...rest,
      headers: {
        accept: 'application/json',
        ...(json === undefined ? {} : { 'content-type': 'application/json' }),
        ...rest.headers,
      },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return { ...OFFLINE, status: 0 }
  }
  const body: unknown = await response.json().catch(() => null)
  if (response.ok) return { ok: true, status: response.status, data: body as T }
  const problem = (
    body as { error?: { code?: unknown; message?: unknown; issues?: unknown } } | null
  )?.error
  return {
    ok: false,
    status: response.status,
    code: typeof problem?.code === 'string' ? problem.code : `HTTP_${response.status}`,
    message: typeof problem?.message === 'string' ? problem.message : 'The request failed.',
    ...(Array.isArray(problem?.issues) ? { issues: problem.issues as ApiProblem['issues'] } : {}),
  }
}
