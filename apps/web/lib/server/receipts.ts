import 'server-only'
import { isReceiptId, type PublicReceipt } from '@then/core'
import { project, walletRows, type WalletRow } from '@then/engine'
import { verifyPublic, type DriftReport, type VerifyReport } from '@then/receipt'
import { cache } from 'react'
import { getRepo } from './db'
import { env } from './env'
import { trustedKeys } from './keys'
import { log } from './nansen'

export function receiptVerifies(receipt: PublicReceipt): boolean {
  return verifyPublic(receipt, { trustedKeys: trustedKeys() }).ok
}

export interface RestampEntry {
  receipt_id: string
  created_at: string
  drift: DriftReport
}

export interface ReceiptView {
  receipt: PublicReceipt
  report: VerifyReport
  /** Later restamps of this receipt, oldest first. */
  restamps: RestampEntry[]
  /** When this receipt is itself a restamp: how it differs from the original. */
  driftFromOriginal: DriftReport | null
}

/** One receipt with its verification and restamp history. Deduplicated per request. */
export const loadReceiptView = cache(async (id: string): Promise<ReceiptView | null> => {
  if (!isReceiptId(id)) return null
  const repo = await getRepo()
  const receipt = await repo.getPublicReceipt(id)
  if (!receipt) return null
  const toEntry = (row: {
    restamp_receipt_id: string
    created_at: string
    drift: unknown
  }): RestampEntry => ({
    receipt_id: row.restamp_receipt_id,
    created_at: row.created_at,
    drift: row.drift as DriftReport,
  })
  const restamps = (await repo.restampsOf(id)).map(toEntry)
  const siblings = receipt.restamp_of
    ? (await repo.restampsOf(receipt.restamp_of)).map(toEntry)
    : []
  return {
    receipt,
    report: verifyPublic(receipt, { trustedKeys: trustedKeys() }),
    restamps,
    driftFromOriginal: siblings.find((entry) => entry.receipt_id === id)?.drift ?? null,
  }
})

/**
 * The receipt Inspect offers as a replayed example: the operator's featured receipt, else the
 * newest live stamp. Only a receipt that verifies against this deployment's keys is offered.
 */
export async function exampleReceipt(): Promise<PublicReceipt | null> {
  try {
    const repo = await getRepo()
    const featured = await repo.featuredReceipt()
    if (featured && receiptVerifies(featured)) return featured
    for (const item of await repo.listReceipts({ origin: 'live_stamp', limit: 10 })) {
      const receipt = await repo.getPublicReceipt(item.receipt_id)
      if (receipt && receiptVerifies(receipt)) return receipt
    }
    return null
  } catch (error) {
    log('error', {
      event: 'receipts.example_failed',
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export type WalletDetail = { kind: 'trades'; rows: WalletRow[] } | { kind: 'aggregate' }

/**
 * Wallet-level diagnostics for a receipt. Returns null unless THEN_PUBLIC_MEMBERSHIP_DETAIL is on,
 * which a deployment may set only with Nansen's written approval: this is Smart Money membership.
 */
export async function walletDetail(receiptId: string): Promise<WalletDetail | null> {
  if (!env.publicMembershipDetail || !isReceiptId(receiptId)) return null
  const bundle = await (await getRepo()).getPrivateBundle(receiptId)
  if (!bundle) return null
  const body = bundle.internal.body
  if (body.claim.claim_type !== 'SM_BOUGHT' && body.claim.claim_type !== 'SM_SOLD')
    return { kind: 'aggregate' }
  const projections = project(bundle.records, {
    window: body.window,
    chain: body.claim.chain,
    token_address: body.claim.token_address,
  })
  return {
    kind: 'trades',
    rows: walletRows(projections.live_trades, projections.asof_trades, body.summary.price_vwap_usd),
  }
}
