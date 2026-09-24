import 'server-only'
import type { PublicReceipt } from '@then/core'
import { verifyPublic } from '@then/receipt'
import { getRepo } from './db'
import { trustedKeys } from './keys'
import { log } from './nansen'

export function receiptVerifies(receipt: PublicReceipt): boolean {
  return verifyPublic(receipt, { trustedKeys: trustedKeys() }).ok
}

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
