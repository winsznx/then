import { hashBytes, hashCanonical } from '@then/core'
import type { z } from 'zod'
import { unexpectedFields } from './drift'
import type { EndpointSpec, Surface } from './endpoints'
import { errorFromResponse, localError, type NansenError } from './errors'

export const NANSEN_BASE_URL = 'https://api.nansen.ai'
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_MAX_RETRIES = 2
const DEFAULT_CONCURRENCY = 8
const MAX_RETRY_WAIT_MS = 8_000

/** One raw response exactly as received. The private evidence bundle stores these. */
export interface CapturedPayload {
  endpoint: string
  method: 'GET' | 'POST'
  path: string
  surface: Surface
  request: unknown
  request_hash: string
  status: number
  body: string
  body_hash: string
  fetched_at: string
  latency_ms: number
  attempt: number
  credits_cost: number | null
  credits_used: number | null
  credits_remaining: number | null
  request_id: string | null
}

export type CallResult<T> =
  | { ok: true; data: T; payload: CapturedPayload; drift: string[] }
  | { ok: false; error: NansenError; payload: CapturedPayload | null }

export interface LogEvent {
  event: string
  endpoint?: string
  status?: number | null
  credits_used?: number | null
  latency_ms?: number
  attempt?: number
  error?: string
  [key: string]: unknown
}

export interface Logger {
  info(entry: LogEvent): void
  warn(entry: LogEvent): void
}

export const silentLogger: Logger = { info: () => {}, warn: () => {} }

export interface NansenClientOptions {
  apiKey: string | undefined
  baseUrl?: string
  timeoutMs?: number
  maxRetries?: number
  concurrency?: number
  /** Ablation: fail every point-in-time surface closed without touching the network. */
  disableHistorical?: boolean
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => Date
  logger?: Logger
}

export interface CallOptions {
  signal?: AbortSignal
  onPayload?: (payload: CapturedPayload) => void
}

class Semaphore {
  private active = 0
  private readonly waiting: (() => void)[] = []

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiting.push(resolve))
    this.active++
    try {
      return await task()
    } finally {
      this.active--
      this.waiting.shift()?.()
    }
  }
}

export class NansenClient {
  private readonly apiKey: string | undefined
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly disableHistorical: boolean
  private readonly fetchImpl: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly now: () => Date
  private readonly logger: Logger
  private readonly limiter: Semaphore

  constructor(options: NansenClientOptions) {
    this.apiKey = options.apiKey?.trim() || undefined
    this.baseUrl = options.baseUrl ?? NANSEN_BASE_URL
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    this.disableHistorical = options.disableHistorical ?? false
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.now = options.now ?? (() => new Date())
    this.logger = options.logger ?? silentLogger
    this.limiter = new Semaphore(options.concurrency ?? DEFAULT_CONCURRENCY)
  }

  get historicalDisabled(): boolean {
    return this.disableHistorical
  }

  get hasKey(): boolean {
    return this.apiKey !== undefined
  }

  async call<S extends z.ZodType>(
    spec: EndpointSpec<S>,
    request: object | undefined,
    options: CallOptions = {},
  ): Promise<CallResult<z.infer<S>>> {
    if (spec.surface === 'asof' && this.disableHistorical) {
      this.logger.info({ event: 'nansen.disabled', endpoint: spec.id })
      return {
        ok: false,
        error: localError(
          'disabled',
          'SPONSOR_HISTORICAL_DISABLED',
          'point-in-time surfaces are disabled',
        ),
        payload: null,
      }
    }
    if (!this.apiKey) {
      return {
        ok: false,
        error: localError('missing_key', 'MISSING_API_KEY', 'NANSEN_API_KEY is not configured'),
        payload: null,
      }
    }
    return this.limiter.run(() => this.callWithRetry(spec, request, options))
  }

  private async callWithRetry<S extends z.ZodType>(
    spec: EndpointSpec<S>,
    request: object | undefined,
    options: CallOptions,
  ): Promise<CallResult<z.infer<S>>> {
    let attempt = 0
    for (;;) {
      attempt++
      const result = await this.attempt(spec, request, options, attempt)
      if (
        result.ok ||
        !result.error.retryable ||
        attempt > this.maxRetries ||
        options.signal?.aborted
      ) {
        return result
      }
      const backoff =
        result.error.retryAfterSeconds !== null
          ? result.error.retryAfterSeconds * 1000
          : 400 * 2 ** (attempt - 1)
      const wait = Math.min(backoff, MAX_RETRY_WAIT_MS)
      this.logger.warn({
        event: 'nansen.retry',
        endpoint: spec.id,
        status: result.error.status,
        attempt,
        wait_ms: wait,
      })
      await this.sleep(wait)
    }
  }

  private async attempt<S extends z.ZodType>(
    spec: EndpointSpec<S>,
    request: object | undefined,
    options: CallOptions,
    attempt: number,
  ): Promise<CallResult<z.infer<S>>> {
    const url = new URL(spec.path, this.baseUrl)
    if (spec.method === 'GET' && request) {
      for (const [key, value] of Object.entries(request)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
      }
    }
    const signals = [AbortSignal.timeout(this.timeoutMs)]
    if (options.signal) signals.push(options.signal)
    const started = this.now()
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: spec.method,
        headers: {
          apikey: this.apiKey as string,
          accept: 'application/json',
          ...(spec.method === 'POST' ? { 'content-type': 'application/json' } : {}),
        },
        body: spec.method === 'POST' ? JSON.stringify(request ?? {}) : undefined,
        signal: AbortSignal.any(signals),
      })
    } catch (cause) {
      const aborted = options.signal?.aborted ?? false
      const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError'
      const error = aborted
        ? localError('aborted', 'UPSTREAM_TIMEOUT', 'stamp deadline reached')
        : timedOut
          ? localError('timeout', 'UPSTREAM_TIMEOUT', `no response within ${this.timeoutMs}ms`)
          : localError(
              'network',
              'NETWORK_ERROR',
              cause instanceof Error ? cause.message : 'network error',
            )
      this.logger.warn({ event: 'nansen.error', endpoint: spec.id, attempt, error: error.code })
      return { ok: false, error, payload: null }
    }

    const body = await response.text()
    const latency = this.now().getTime() - started.getTime()
    const header = (name: string): string | null => response.headers.get(name)
    const payload: CapturedPayload = {
      endpoint: spec.id,
      method: spec.method,
      path: spec.path,
      surface: spec.surface,
      request: request ?? null,
      request_hash: hashCanonical({ path: spec.path, request: request ?? null }),
      status: response.status,
      body,
      body_hash: hashBytes(body),
      fetched_at: started.toISOString(),
      latency_ms: latency,
      attempt,
      credits_cost: numberHeader(header('x-nansen-credits-cost')),
      credits_used: numberHeader(header('x-nansen-credits-used')),
      credits_remaining: numberHeader(header('x-nansen-credits-remaining')),
      request_id: header('x-request-id'),
    }
    options.onPayload?.(payload)
    this.logger.info({
      event: 'nansen.response',
      endpoint: spec.id,
      status: response.status,
      credits_used: payload.credits_used,
      latency_ms: latency,
      attempt,
    })

    if (!response.ok) {
      return {
        ok: false,
        error: errorFromResponse(response.status, body, payload.request_id, header('retry-after')),
        payload,
      }
    }

    let json: unknown
    try {
      json = JSON.parse(body)
    } catch {
      return {
        ok: false,
        error: localError('schema', 'SCHEMA_DRIFT', 'response is not JSON'),
        payload,
      }
    }
    const parsed = spec.response.safeParse(json)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const where = issue ? `${issue.path.join('.')}: ${issue.message}` : 'unknown'
      this.logger.warn({ event: 'nansen.schema_drift', endpoint: spec.id, error: where })
      return { ok: false, error: localError('schema', 'SCHEMA_DRIFT', where), payload }
    }
    const drift = unexpectedFields(spec.response, json, spec.rows)
    if (drift.length)
      this.logger.warn({ event: 'nansen.unexpected_fields', endpoint: spec.id, fields: drift })
    return { ok: true, data: parsed.data, payload, drift }
  }
}

function numberHeader(value: string | null): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
