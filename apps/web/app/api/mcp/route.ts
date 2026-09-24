import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createThenMcpServer, type VerdictResult } from '@then/mcp'
import { env } from '@/lib/server/env'
import { handleError, problem } from '@/lib/server/http'
import { clientKey } from '@/lib/server/session'
import { stampNow } from '@/lib/server/stamp'

export const maxDuration = 60

const UNAVAILABLE: Record<string, string> = {
  NO_API_KEY: 'This deployment has no Nansen API key, so it cannot stamp.',
  NO_SIGNING_KEY: 'This deployment has no receipt signing key, so it cannot stamp.',
  UPSTREAM_BUSY: 'Nansen is rate-limiting requests right now. Try again in a minute.',
  QUOTA_REACHED:
    'The public deployment has used its Nansen credits for now. Run `then mcp` with your own key.',
}

async function verdict(input: unknown, client: string): Promise<VerdictResult> {
  const result = await stampNow(input, client)
  const url = (id: string) => `${env.publicBaseUrl}/r/${id}`
  switch (result.kind) {
    case 'done':
      return {
        ok: true,
        receipt: result.receipt,
        url: url(result.receipt.receipt_id),
        path: null,
        reused: false,
      }
    case 'existing':
      return {
        ok: true,
        receipt: result.receipt,
        url: url(result.receipt.receipt_id),
        path: null,
        reused: true,
      }
    case 'invalid':
      return {
        ok: false,
        message: result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
      }
    case 'unavailable':
      return {
        ok: false,
        message: UNAVAILABLE[result.reason] ?? 'This deployment cannot stamp right now.',
      }
    case 'rate_limited':
      return {
        ok: false,
        message: `This deployment allows ${result.limit} stamps per hour per client.`,
      }
    case 'failed':
      return {
        ok: false,
        message: 'The stamp failed before a receipt was written. Nothing was recorded.',
      }
  }
}

/**
 * Stateless MCP over Streamable HTTP: one server per request, JSON responses, no session. The
 * tool shares the web app's limits, credit floor, and receipt store.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const client = await clientKey()
    const server = createThenMcpServer({
      version: '1.0.0',
      baseUrl: env.publicBaseUrl,
      verdict: (input) => verdict(input, client),
    })
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    return await transport.handleRequest(request)
  } catch (error) {
    return handleError(error)
  }
}

export function GET(): Response {
  return problem(
    405,
    'METHOD_NOT_ALLOWED',
    'This MCP endpoint is stateless. Send JSON-RPC requests with POST.',
  )
}

export const DELETE = GET
