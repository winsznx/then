import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { parseClaim } from '@then/core'
import { createThenMcpServer } from '@then/mcp'
import { buildReceipt } from '@then/receipt'
import { runStamp } from '@then/stamp'
import { FsReceiptStore } from '@then/store'
import { EXIT, gitSha, localSigningKey, nansenClient } from '../config'

/**
 * MCP over stdio for agents on this machine. Stamps run with the local Nansen key and receipts
 * are written to --out; the agent gets the public-safe result and the receipt path. stdout is the
 * protocol channel, so every log line goes to stderr.
 */
export async function mcpCommand(flags: { out: string }): Promise<number> {
  const client = nansenClient()
  const signer = await localSigningKey()
  const store = new FsReceiptStore(flags.out)
  const server = createThenMcpServer({
    version: '1.0.0',
    baseUrl: process.env.THEN_PUBLIC_BASE_URL?.replace(/\/$/, '') || null,
    verdict: async (input) => {
      const parsed = parseClaim(input)
      if (!parsed.ok)
        return {
          ok: false,
          message: parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
        }
      const run = await runStamp(parsed.claim, { client })
      if (run.layers.some((layer) => layer.error?.kind === 'auth'))
        return { ok: false, message: 'Nansen rejected the API key, so THEN cannot stamp.' }
      const bundle = buildReceipt(run, { origin: 'live_stamp', gitSha: gitSha(), signer })
      const dir = await store.write(bundle)
      return { ok: true, receipt: bundle.public, url: null, path: dir, reused: false }
    },
  })
  await server.connect(new StdioServerTransport())
  process.stderr.write(
    `then mcp: serving verdict_smart_money_claim on stdio, receipts in ${store.root}\n`,
  )
  return EXIT.OK
}
