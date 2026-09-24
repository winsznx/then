/**
 * Trade preparation behind the verdict gate. THEN prepares an unsigned swap only for a VALID live
 * stamp and hands it to the user's own wallet. It never signs, never holds a key, and never calls
 * Nansen's execute endpoint.
 */
import {
  hashCanonical,
  normalizeTokenAddress,
  randomId,
  type Chain,
  type PublicReceipt,
} from '@then/core'
import { ENDPOINTS, type NansenClient } from '@then/nansen'

export type TradeChain = 'solana' | 'base'

const USDC: Record<TradeChain, string> = {
  solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  base: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
}

export const MAX_PREPARE_USDC = 1_000

export type GateRefusal =
  | 'VERDICT_NOT_VALID'
  | 'FIXTURE_RECEIPT'
  | 'RECEIPT_UNVERIFIED'
  | 'UNSUPPORTED_TRADE_CHAIN'
  | 'SELL_CLAIM'

export type Gate = { ok: true; chain: TradeChain } | { ok: false; refusal: GateRefusal }

/** The single check every prepare path runs first, server-side. Non-VALID fails closed. */
export function tradeGate(receipt: PublicReceipt, verified: boolean): Gate {
  if (!verified) return { ok: false, refusal: 'RECEIPT_UNVERIFIED' }
  if (receipt.origin === 'fixture') return { ok: false, refusal: 'FIXTURE_RECEIPT' }
  if (receipt.verdict !== 'VALID') return { ok: false, refusal: 'VERDICT_NOT_VALID' }
  if (receipt.claim.claim_type === 'SM_SOLD') return { ok: false, refusal: 'SELL_CLAIM' }
  const chain = receipt.claim.chain
  if (chain !== 'solana' && chain !== 'base')
    return { ok: false, refusal: 'UNSUPPORTED_TRADE_CHAIN' }
  return { ok: true, chain }
}

export interface PrepareRequest {
  wallet_address: string
  amount_usdc: number
  slippage_bps?: number
}

export type RequestCheck =
  { ok: true; wallet: string; amount_base_units: string } | { ok: false; error: string }

export function checkRequest(chain: TradeChain, request: PrepareRequest): RequestCheck {
  const wallet = normalizeTokenAddress(chain as Chain, request.wallet_address ?? '')
  if (!wallet) return { ok: false, error: 'INVALID_WALLET' }
  const amount = Number(request.amount_usdc)
  if (!Number.isFinite(amount) || amount < 5 || amount > MAX_PREPARE_USDC)
    return { ok: false, error: 'INVALID_AMOUNT' }
  return { ok: true, wallet, amount_base_units: String(Math.round(amount * 1_000_000)) }
}

export interface PaperIntent {
  mode: 'paper'
  intent_id: string
  receipt_id: string
  chain: TradeChain
  from_token: string
  to_token: string
  amount_usdc: number
  wallet_address: string
  intent_hash: string
}

/** Paper mode (default): records what would be prepared. Nothing is sent anywhere. */
export function paperIntent(
  receipt: PublicReceipt,
  chain: TradeChain,
  wallet: string,
  amountUsdc: number,
): PaperIntent {
  const body = {
    receipt_id: receipt.receipt_id,
    chain,
    from_token: USDC[chain],
    to_token: receipt.claim.token_address,
    amount_usdc: amountUsdc,
    wallet_address: wallet,
  }
  return { mode: 'paper', intent_id: randomId('int'), ...body, intent_hash: hashCanonical(body) }
}

export type LivePrepare =
  | {
      ok: true
      mode: 'live'
      chain: TradeChain
      /** Unsigned; the user's wallet signs and sends it. */
      transaction: string | null
      swap_tx: Record<string, unknown> | null
      approval_tx: Record<string, unknown> | null
      needs_approval: boolean
      simulation_passed: boolean | null
      prepare_hash: string
    }
  | { ok: false; error: string }

/** Live mode: Nansen quote, then prepare. Stops there: signing and sending stay with the user. */
export async function livePrepare(
  client: NansenClient,
  receipt: PublicReceipt,
  chain: TradeChain,
  wallet: string,
  amountBaseUnits: string,
  slippageBps = 100,
): Promise<LivePrepare> {
  const quote = await client.call(ENDPOINTS.tradeQuote, {
    chain,
    from_token: USDC[chain],
    to_token: receipt.claim.token_address,
    amount: amountBaseUnits,
    wallet_address: wallet,
    slippage: slippageBps,
  })
  if (!quote.ok) return { ok: false, error: quote.error.code }
  const first = quote.data.quotes?.[0]
  if (!first) return { ok: false, error: 'NO_ROUTE' }
  const prepared = await client.call(ENDPOINTS.tradePrepare, {
    chain,
    wallet_address: wallet,
    quote: first,
    skip_simulation: false,
  })
  if (!prepared.ok) return { ok: false, error: prepared.error.code }
  return {
    ok: true,
    mode: 'live',
    chain,
    transaction: prepared.data.transaction ?? null,
    swap_tx: (prepared.data.swapTxData as Record<string, unknown> | null | undefined) ?? null,
    approval_tx:
      (prepared.data.approvalTxData as Record<string, unknown> | null | undefined) ?? null,
    needs_approval: prepared.data.needsApproval ?? false,
    simulation_passed: prepared.data.simulationPassed ?? null,
    prepare_hash: prepared.payload.body_hash,
  }
}
