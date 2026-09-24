import vinextHandler from 'vinext/server/fetch-handler'
import {
  releaseRequestScope,
  runInRequestScope,
  type RequestScope,
} from '../lib/server/request-scope'

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
  readonly props?: unknown
}

type FetchHandler = (request: Request, env: unknown, ctx: ExecutionContext) => Promise<Response>

const handler = vinextHandler as { fetch: FetchHandler } & Record<string, unknown>

/** Waits for every task, including tasks registered while earlier ones were running. */
async function settle(tasks: Promise<unknown>[]): Promise<void> {
  for (let seen = 0; seen < tasks.length;) {
    const batch = tasks.slice(seen)
    seen = tasks.length
    await Promise.allSettled(batch)
  }
}

/** The same bytes, with `done` called once the body is fully sent, fails, or the client leaves. */
function onBodySettled(
  body: ReadableStream<Uint8Array>,
  done: () => void,
): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  let settled = false
  const finish = () => {
    if (settled) return
    settled = true
    done()
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read()
        if (chunk.done) {
          controller.close()
          finish()
        } else {
          controller.enqueue(chunk.value)
        }
      } catch (error) {
        controller.error(error)
        finish()
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason)
      } finally {
        finish()
      }
    },
  })
}

/**
 * Runs vinext's handler with each request in its own scope. A Worker cannot share a socket across
 * requests, so the request's database connection is opened on first use and closed once the
 * response is sent and every `waitUntil` task (the `after()` work, a stamp whose visitor left) has
 * settled, which hands the connection back to the pooler promptly.
 */
async function fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
  const scope: RequestScope = {}
  const background: Promise<unknown>[] = []
  const context: ExecutionContext = {
    waitUntil(promise) {
      background.push(promise)
      ctx.waitUntil(promise)
    },
    passThroughOnException() {
      ctx.passThroughOnException()
    },
    props: ctx.props,
  }
  const release = () => {
    const closed = settle(background)
      .then(() => releaseRequestScope(scope))
      .catch((error: unknown) => {
        const entry = { ts: new Date().toISOString(), level: 'warn', event: 'db.release_failed' }
        console.warn(JSON.stringify({ ...entry, error: String(error) }))
      })
    ctx.waitUntil(closed)
  }

  let response: Response
  try {
    response = await runInRequestScope(scope, () => handler.fetch(request, env, context))
  } catch (error) {
    release()
    throw error
  }
  if (!response.body) {
    release()
    return response
  }
  return new Response(onBodySettled(response.body, release), response)
}

/** The Cloudflare Worker entry: vinext's exports, with `fetch` scoped per request. */
const worker = { ...handler, fetch }

export default worker
