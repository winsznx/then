import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { DISCLAIMER } from '@then/core'
import { SCENARIOS, runFromScenario } from '@then/fixtures'
import {
  FIXTURE_SIGNING_KEY,
  buildReceipt,
  redistributionFindings,
  type ReceiptBundle,
} from '@then/receipt'
import { describe, expect, it } from 'vitest'
import { VERDICT_TOOL, createThenMcpServer, type VerdictResult } from '../src'

function fixtureBundle(id: string): ReceiptBundle {
  const scenario = SCENARIOS.find((s) => s.id === id)!
  return buildReceipt(runFromScenario(scenario), {
    origin: 'fixture',
    gitSha: null,
    signer: FIXTURE_SIGNING_KEY,
  })
}

async function connect(verdict: () => Promise<VerdictResult>) {
  const server = createThenMcpServer({ version: 'test', baseUrl: 'https://then.example', verdict })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client({ name: 'test', version: 'test' })
  await client.connect(clientTransport)
  return client
}

const CLAIM = {
  claim_type: 'SM_BOUGHT',
  chain: 'solana',
  token_address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  as_of_date: '2026-06-12',
}

describe('verdict_smart_money_claim', () => {
  it('is listed with an input schema that requires the exact contract and date', async () => {
    // #given a connected client
    const client = await connect(async () => ({ ok: false, message: 'unused' }))
    // #when the tools are listed
    const { tools } = await client.listTools()
    // #then the verdict tool demands the fields a verdict depends on
    const tool = tools.find((t) => t.name === VERDICT_TOOL)
    expect(tool?.inputSchema.required).toEqual([
      'claim_type',
      'chain',
      'token_address',
      'as_of_date',
    ])
  })

  it('returns the receipt verdict with limits and no private evidence', async () => {
    // #given a planted-contamination fixture receipt behind the tool
    const bundle = fixtureBundle('P1')
    const client = await connect(async () => ({
      ok: true,
      receipt: bundle.public,
      url: 'https://then.example/r/x',
      path: null,
      reused: false,
    }))
    // #when an agent asks for a verdict
    const result = await client.callTool({ name: VERDICT_TOOL, arguments: CLAIM })
    // #then the answer is the receipt's verdict, carries the disclaimer, and leaks nothing private
    const output = result.structuredContent as {
      verdict: string
      limits: { disclaimer: string }
      receipt: { receipt_id: string }
    }
    expect({
      verdict: output.verdict,
      disclaimer: output.limits.disclaimer,
      receiptId: output.receipt.receipt_id,
      findings: redistributionFindings(result.structuredContent ?? {}, bundle),
    }).toEqual({
      verdict: bundle.public.verdict,
      disclaimer: DISCLAIMER,
      receiptId: bundle.receipt_id,
      findings: [],
    })
  })

  it('reports a refusal as a tool error instead of a verdict', async () => {
    // #given a deployment that cannot stamp
    const client = await connect(async () => ({
      ok: false,
      message: 'This deployment has no Nansen API key.',
    }))
    // #when the tool is called
    const result = await client.callTool({ name: VERDICT_TOOL, arguments: CLAIM })
    // #then the agent sees an error with the reason and no structured verdict
    expect({ isError: result.isError, structured: result.structuredContent }).toEqual({
      isError: true,
      structured: undefined,
    })
  })

  it('rejects a malformed date before any stamp runs', async () => {
    // #given a verdict function that records whether it ran
    let ran = false
    const client = await connect(async () => {
      ran = true
      return { ok: false, message: 'unused' }
    })
    // #when the date is not YYYY-MM-DD
    const result = await client.callTool({
      name: VERDICT_TOOL,
      arguments: { ...CLAIM, as_of_date: 'June 12' },
    })
    // #then the call fails validation and nothing was stamped
    expect({ isError: result.isError, ran }).toEqual({ isError: true, ran: false })
  })
})
