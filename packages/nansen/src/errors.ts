import { ErrorBodySchema } from './schemas'

export type NansenErrorKind =
  | 'disabled'
  | 'missing_key'
  | 'auth'
  | 'forbidden'
  | 'payment'
  | 'insufficient_credits'
  | 'invalid_request'
  | 'not_found'
  | 'rate_limit'
  | 'timeout'
  | 'aborted'
  | 'upstream'
  | 'network'
  | 'schema'

export interface NansenError {
  kind: NansenErrorKind
  /** HTTP status when a response arrived. */
  status: number | null
  /** Nansen's machine code when the body carried one, else THEN's own code. */
  code: string
  message: string
  retryable: boolean
  requestId: string | null
  retryAfterSeconds: number | null
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

/** Classify by HTTP status first: the gateway's 401 body has no `code` field. */
export function errorFromResponse(
  status: number,
  bodyText: string,
  requestId: string | null,
  retryAfterHeader: string | null,
): NansenError {
  let code: string | null = null
  let message = `HTTP ${status}`
  let retryAfter: number | null = parseRetryAfter(retryAfterHeader)
  try {
    const parsed = ErrorBodySchema.safeParse(JSON.parse(bodyText))
    if (parsed.success) {
      code = parsed.data.code ?? null
      message = parsed.data.message ?? parsed.data.error ?? message
      if (retryAfter === null && typeof parsed.data.retry_after === 'number')
        retryAfter = parsed.data.retry_after
    }
  } catch {
    // Non-JSON error bodies (proxies, HTML) keep the status message.
  }

  const kind = kindForStatus(status, code)
  return {
    kind,
    status,
    code: code ?? kind.toUpperCase(),
    message: truncate(message, 300),
    retryable: RETRYABLE_STATUSES.has(status) && code !== 'insufficient_credits',
    requestId,
    retryAfterSeconds: retryAfter,
  }
}

function kindForStatus(status: number, code: string | null): NansenErrorKind {
  if (code === 'insufficient_credits') return 'insufficient_credits'
  if (code === 'query_timeout') return 'timeout'
  switch (status) {
    case 401:
      return 'auth'
    case 402:
      return 'payment'
    case 403:
      return 'forbidden'
    case 404:
      return 'not_found'
    case 400:
    case 422:
      return 'invalid_request'
    case 429:
      return 'rate_limit'
    case 504:
      return 'timeout'
    default:
      return status >= 500 ? 'upstream' : 'invalid_request'
  }
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds
  const date = Date.parse(header)
  return Number.isNaN(date) ? null : Math.max(0, (date - Date.now()) / 1000)
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function localError(kind: NansenErrorKind, code: string, message: string): NansenError {
  return {
    kind,
    status: null,
    code,
    message,
    retryable: kind === 'network',
    requestId: null,
    retryAfterSeconds: null,
  }
}
