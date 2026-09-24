import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  CHAINS,
  DISCLAIMER,
  REASONS,
  RESTATEMENT_NOTICE,
  SUPPORT_STATES,
  VERDICTS,
  isPublicReason,
  type ClaimInput,
  type PublicReceipt,
} from '@then/core'
import { z } from 'zod'

export const VERDICT_TOOL = 'verdict_smart_money_claim'

/** Claim types an agent can ask about. Perp claims have no dated Nansen surface. */
const CLAIM_TYPES = ['SM_BOUGHT', 'SM_SOLD', 'SM_HOLDS'] as const

export const verdictInputShape = {
  claim_type: z
    .enum(CLAIM_TYPES)
    .describe('What the claim says Smart Money did: SM_BOUGHT, SM_SOLD, or SM_HOLDS.'),
  chain: z.enum(CHAINS).describe('Chain the token lives on.'),
  token_address: z
    .string()
    .min(1)
    .max(128)
    .describe('Exact token contract address. THEN never guesses a contract from a symbol.'),
  as_of_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe('The UTC day the claim is about, YYYY-MM-DD. The current UTC day cannot be stamped.'),
  token_symbol: z.string().max(32).optional().describe('Symbol for display only.'),
  window_hours: z
    .number()
    .int()
    .min(24)
    .max(168)
    .optional()
    .describe('Window ending on as_of_date, whole days only. Default 24.'),
  min_usd: z
    .number()
    .positive()
    .optional()
    .describe('Smallest Smart Money net flow or position that counts as support. Default 1000.'),
  source_url: z.string().url().optional().describe('Where the claim was published.'),
}

const support = z.enum(SUPPORT_STATES)

export const verdictOutputShape = {
  verdict: z.enum(VERDICTS),
  claim: z.object({
    claim_type: z.string(),
    chain: z.string(),
    token_address: z.string(),
    token_symbol: z.string().nullable(),
    as_of_date: z.string(),
    window_hours: z.number(),
  }),
  todays_labels_support: support,
  asof_support: support,
  explanation: z.string(),
  reasons: z.array(z.object({ code: z.string(), text: z.string() })),
  receipt: z.object({
    receipt_id: z.string(),
    url: z.string().nullable(),
    path: z.string().nullable(),
    generated_at: z.string(),
    method_version: z.string(),
    reused: z.boolean(),
  }),
  limits: z.object({
    disclaimer: z.string(),
    restatement_notice: z.string(),
    method_url: z.string().nullable(),
    limits_url: z.string().nullable(),
  }),
  powered_by: z.literal('Nansen API'),
}

const VerdictOutput = z.object(verdictOutputShape)
export type VerdictOutput = z.infer<typeof VerdictOutput>

export type VerdictResult =
  | { ok: true; receipt: PublicReceipt; url: string | null; path: string | null; reused: boolean }
  | { ok: false; message: string }

export interface ThenMcpOptions {
  version: string
  /** Site the method and limits pages live on; null when running without one. */
  baseUrl: string | null
  verdict: (input: ClaimInput) => Promise<VerdictResult>
}

/**
 * The machine answer. It is built from the public receipt only, so it carries support states,
 * the verdict, public reasons, and the receipt reference, never Nansen payloads or wallets.
 */
export function publicResult(
  receipt: PublicReceipt,
  where: { url: string | null; path: string | null; reused: boolean },
  baseUrl: string | null,
): VerdictOutput {
  return VerdictOutput.parse({
    verdict: receipt.verdict,
    claim: {
      claim_type: receipt.claim.claim_type,
      chain: receipt.claim.chain,
      token_address: receipt.claim.token_address,
      token_symbol: receipt.claim.token_symbol ?? null,
      as_of_date: receipt.claim.as_of_date,
      window_hours: receipt.claim.window_hours,
    },
    todays_labels_support: receipt.comparison.live_label_replay_support,
    asof_support: receipt.comparison.asof_support,
    explanation: receipt.comparison.public_explanation,
    reasons: receipt.reasons
      .filter(isPublicReason)
      .map((code) => ({ code, text: REASONS[code].text })),
    receipt: {
      receipt_id: receipt.receipt_id,
      url: where.url,
      path: where.path,
      generated_at: receipt.generated_at,
      method_version: receipt.method_version,
      reused: where.reused,
    },
    limits: {
      disclaimer: DISCLAIMER,
      restatement_notice: RESTATEMENT_NOTICE,
      method_url: baseUrl ? `${baseUrl}/method` : null,
      limits_url: baseUrl ? `${baseUrl}/limits` : null,
    },
    powered_by: 'Nansen API',
  })
}

function summary(result: VerdictOutput): string {
  const lines = [
    `${result.verdict}: ${result.explanation}`,
    `Today's labels support: ${result.todays_labels_support}. Cohort on ${result.claim.as_of_date} supports: ${result.asof_support}.`,
    `Receipt ${result.receipt.receipt_id}${result.receipt.url ? ` (${result.receipt.url})` : result.receipt.path ? ` (${result.receipt.path})` : ''}, method ${result.receipt.method_version}.`,
    result.limits.disclaimer,
  ]
  return lines.join('\n')
}

export function createThenMcpServer(options: ThenMcpOptions): McpServer {
  const server = new McpServer(
    { name: 'then', version: options.version },
    {
      instructions:
        "THEN checks whether a Smart Money claim was true on its date, using Nansen point-in-time data instead of today's labels. Cite the receipt with the verdict. VALID is not a trading signal.",
    },
  )
  server.registerTool(
    VERDICT_TOOL,
    {
      title: 'Verdict a Smart Money claim',
      description:
        'Before citing a claim like "Smart Money bought TOKEN on DATE", check it. THEN rebuilds the claim twice: with today\'s Nansen Smart Money labels and with the cohort Nansen recognized on that date. Returns VALID (the cohort of the day supports it), CONTAMINATED (only today\'s labels support it), or INSUFFICIENT (the record cannot decide), with a signed receipt. Stamping spends Nansen API credits; the same claim within ten minutes returns the earlier receipt. It never predicts price.',
      inputSchema: verdictInputShape,
      outputSchema: verdictOutputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await options.verdict(args)
      if (!result.ok) return { isError: true, content: [{ type: 'text', text: result.message }] }
      const output = publicResult(
        result.receipt,
        { url: result.url, path: result.path, reused: result.reused },
        options.baseUrl,
      )
      return { content: [{ type: 'text', text: summary(output) }], structuredContent: output }
    },
  )
  return server
}
