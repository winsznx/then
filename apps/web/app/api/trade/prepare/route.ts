import { isReceiptId } from '@then/core'
import { verifyPublic } from '@then/receipt'
import { checkRequest, livePrepare, paperIntent, tradeGate } from '@then/trade'
import { getRepo } from '@/lib/server/db'
import { env } from '@/lib/server/env'
import { handleError, json, problem, readJson } from '@/lib/server/http'
import { trustedKeys } from '@/lib/server/keys'
import { nansen } from '@/lib/server/nansen'
import { clientKey } from '@/lib/server/session'

const REFUSALS: Record<string, string> = {
  VERDICT_NOT_VALID:
    'Only a VALID stamp can prepare a trade. CONTAMINATED and INSUFFICIENT claims are refused.',
  FIXTURE_RECEIPT: 'Fixture receipts never prepare trades.',
  RECEIPT_UNVERIFIED: 'The receipt did not pass verification.',
  UNSUPPORTED_TRADE_CHAIN: 'Nansen Trading supports Solana and Base only.',
  SELL_CLAIM: 'A sell claim does not prepare a buy.',
}

/**
 * Prepares a buy behind the verdict gate. Paper mode records a hashed intent. Live mode returns
 * an unsigned transaction for the user's own wallet; THEN never signs or broadcasts.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await readJson(request, 2048)) as {
      receipt_id?: unknown
      wallet_address?: unknown
      amount_usdc?: unknown
    }
    if (typeof body.receipt_id !== 'string' || !isReceiptId(body.receipt_id))
      return problem(404, 'NOT_FOUND', 'No such receipt.')
    const repo = await getRepo()
    const receipt = await repo.getPublicReceipt(body.receipt_id)
    if (!receipt) return problem(404, 'NOT_FOUND', 'No such receipt.')
    await repo.recordEvent('trade_prepare_attempted', null, {
      verdict: receipt.verdict,
      chain: receipt.claim.chain,
      mode: env.tradeMode,
    })

    const gate = tradeGate(receipt, verifyPublic(receipt, { trustedKeys: trustedKeys() }).ok)
    if (!gate.ok) return problem(409, gate.refusal, REFUSALS[gate.refusal] ?? 'Refused.')
    const checked = checkRequest(gate.chain, {
      wallet_address: String(body.wallet_address ?? ''),
      amount_usdc: Number(body.amount_usdc),
    })
    if (!checked.ok)
      return problem(
        422,
        checked.error,
        checked.error === 'INVALID_WALLET'
          ? `Enter a ${gate.chain} wallet address.`
          : 'Enter an amount between 5 and 1,000 USDC.',
      )
    if ((await repo.hitRateLimit('trade', await clientKey(), 3600)) >= 20)
      return problem(429, 'RATE_LIMITED', 'Too many prepare requests. Try again later.')

    if (env.tradeMode === 'paper') {
      const intent = paperIntent(receipt, gate.chain, checked.wallet, Number(body.amount_usdc))
      await repo.putTradeIntent({
        intent_id: intent.intent_id,
        receipt_id: receipt.receipt_id,
        mode: 'paper',
        payload_hash: intent.intent_hash,
        request: intent,
      })
      return json(intent)
    }
    const prepared = await livePrepare(
      nansen(),
      receipt,
      gate.chain,
      checked.wallet,
      checked.amount_base_units,
    )
    if (!prepared.ok) return problem(502, prepared.error, 'Nansen could not prepare this swap.')
    await repo.putTradeIntent({
      intent_id: `int_${prepared.prepare_hash.slice(7, 23)}`,
      receipt_id: receipt.receipt_id,
      mode: 'live',
      payload_hash: prepared.prepare_hash,
      request: {
        chain: gate.chain,
        wallet_address: checked.wallet,
        amount_base_units: checked.amount_base_units,
      },
    })
    return json(prepared)
  } catch (error) {
    return handleError(error)
  }
}
