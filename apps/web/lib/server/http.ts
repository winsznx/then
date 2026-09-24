import 'server-only'
import { env } from './env'
import { SessionUnavailable } from './session'

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(data), { ...init, headers })
}

export function problem(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  return json({ error: { code, message, ...extra } }, { status })
}

export async function readJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  const text = await request.text()
  if (text.length > maxBytes) throw new RequestTooLarge()
  return text ? (JSON.parse(text) as unknown) : {}
}

export class RequestTooLarge extends Error {}

/** Maps configuration and parsing failures to responses; anything else is a 500 with no detail. */
export function handleError(error: unknown): Response {
  if (error instanceof SessionUnavailable)
    return problem(503, 'SESSION_UNAVAILABLE', 'Sessions are not configured on this deployment.')
  if (error instanceof RequestTooLarge)
    return problem(413, 'REQUEST_TOO_LARGE', 'Request body is too large.')
  if (error instanceof SyntaxError)
    return problem(400, 'INVALID_JSON', 'Request body is not valid JSON.')
  process.stdout.write(
    `${JSON.stringify({ ts: new Date().toISOString(), level: 'error', event: 'http.unhandled', error: error instanceof Error ? error.message : String(error) })}\n`,
  )
  return problem(500, 'INTERNAL_ERROR', 'Something went wrong on our side.')
}

/** Internal routes: off unless enabled, and then only with the admin bearer token. */
export function authorizeInternal(request: Request): Response | null {
  if (!env.internalRoutes || !env.adminToken) return problem(404, 'NOT_FOUND', 'Not found.')
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (token.length !== env.adminToken.length || !timingSafe(token, env.adminToken)) {
    return problem(401, 'UNAUTHORIZED', 'Admin token required.')
  }
  return null
}

function timingSafe(a: string, b: string): boolean {
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
