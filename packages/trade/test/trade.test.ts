import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PublicReceipt } from '@then/core'
import { SCENARIOS, runFromScenario } from '@then/fixtures'
import { FIXTURE_SIGNING_KEY, buildReceipt } from '@then/receipt'
import { describe, expect, it } from 'vitest'
import { checkRequest, paperIntent, tradeGate } from '../src'

function receipt(id: string, overrides: Partial<PublicReceipt> = {}): PublicReceipt {
  const bundle = buildReceipt(runFromScenario(SCENARIOS.find((s) => s.id === id)!), {
    origin: 'fixture',
    gitSha: null,
    signer: FIXTURE_SIGNING_KEY,
  })
  return { ...bundle.public, ...overrides }
}

const SOLANA_CLAIM = {
  chain: 'solana' as const,
  token_address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
}

describe('tradeGate', () => {
  it('refuses CONTAMINATED', () => {
    // #given
    const r = receipt('P1', { origin: 'live_stamp' })
    // #then
    expect(tradeGate(r, true)).toEqual({ ok: false, refusal: 'VERDICT_NOT_VALID' })
  })

  it('refuses INSUFFICIENT', () => {
    // #given
    const r = receipt('neither', { origin: 'live_stamp' })
    // #then
    expect(tradeGate(r, true)).toEqual({ ok: false, refusal: 'VERDICT_NOT_VALID' })
  })

  it('refuses an unverified receipt even when it says VALID', () => {
    // #given
    const r = receipt('P2', { origin: 'live_stamp' })
    // #then
    expect(tradeGate(r, false)).toEqual({ ok: false, refusal: 'RECEIPT_UNVERIFIED' })
  })

  it('refuses fixtures', () => {
    // #given
    const r = receipt('P2')
    // #then
    expect(tradeGate(r, true)).toEqual({ ok: false, refusal: 'FIXTURE_RECEIPT' })
  })

  it('refuses chains without Nansen trading', () => {
    // #given the fixture claim is on ethereum
    const r = receipt('P2', { origin: 'live_stamp' })
    // #then
    expect(tradeGate(r, true)).toEqual({ ok: false, refusal: 'UNSUPPORTED_TRADE_CHAIN' })
  })

  it('opens only for a verified VALID live stamp on Solana or Base', () => {
    // #given
    const base = receipt('P2', { origin: 'live_stamp' })
    const r = { ...base, claim: { ...base.claim, ...SOLANA_CLAIM } }
    // #then
    expect(tradeGate(r, true)).toEqual({ ok: true, chain: 'solana' })
  })
})

describe('checkRequest', () => {
  it('rejects a wallet from the wrong chain', () => {
    // #then
    expect(
      checkRequest('solana', {
        wallet_address: '0x0000000000000000000000000000000000000001',
        amount_usdc: 20,
      }),
    ).toEqual({
      ok: false,
      error: 'INVALID_WALLET',
    })
  })

  it('caps the amount', () => {
    // #then
    expect(
      checkRequest('solana', { wallet_address: SOLANA_CLAIM.token_address, amount_usdc: 5000 }),
    ).toEqual({
      ok: false,
      error: 'INVALID_AMOUNT',
    })
  })

  it('converts USDC to base units', () => {
    // #then
    expect(
      checkRequest('base', {
        wallet_address: '0x0000000000000000000000000000000000000001',
        amount_usdc: 25.5,
      }),
    ).toMatchObject({
      ok: true,
      amount_base_units: '25500000',
    })
  })
})

describe('paperIntent', () => {
  it('commits to the receipt it was prepared from', () => {
    // #given
    const r = receipt('P2', { origin: 'live_stamp' })
    // #when
    const intent = paperIntent(r, 'solana', SOLANA_CLAIM.token_address, 20)
    // #then
    expect({ receipt: intent.receipt_id, hash: intent.intent_hash.startsWith('sha256:') }).toEqual({
      receipt: r.receipt_id,
      hash: true,
    })
  })
})

describe('boundaries', () => {
  it('never references the execute endpoint or signing', () => {
    // #given
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(join(here, '../src/index.ts'), 'utf8')
    // #then
    expect(/tradeExecute|\/trade\/execute|signTransaction|secretKey|privateKey/.test(source)).toBe(
      false,
    )
  })
})
