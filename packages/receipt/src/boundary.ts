import { canonicalize, type PublicReceipt } from '@then/core'
import { project } from '@then/engine'
import type { PrivateBundle } from './verify'

/** Keys that carry Smart Money amounts, wallet sets, or labels. None may appear in public output. */
const PRIVATE_KEYS = [
  'wallets',
  'value_usd',
  'net_usd',
  'amount',
  'holders',
  'labels',
  'address_label',
  'trader_address',
  'asof_net_usd',
  'live_net_usd',
  'live_only_wallets',
  'contamination_usd_share',
  'contamination_wallet_share',
  'drift_ratio',
  'summary',
  'measures',
  'layers',
  'payloads',
]

function privateStrings(bundle: PrivateBundle): Set<string> {
  const { body } = bundle.internal
  const projections = project(bundle.records, {
    window: body.window,
    chain: body.claim.chain,
    token_address: body.claim.token_address,
  })
  const out = new Set<string>()
  for (const trades of [projections.live_trades, projections.asof_trades]) {
    for (const trade of trades.trades) {
      out.add(trade.trader.toLowerCase())
      out.add(trade.tx.toLowerCase())
    }
  }
  if (projections.attribution?.wallet) out.add(projections.attribution.wallet.toLowerCase())
  out.delete(body.claim.token_address.toLowerCase())
  return out
}

/**
 * Everything in a public receipt that should not be there: wallet addresses and transaction
 * hashes from the private payloads, or keys that carry Smart Money amounts or membership.
 * An empty list is the redistribution boundary holding.
 */
export function redistributionFindings(
  publicReceipt: PublicReceipt | object,
  bundle: PrivateBundle,
): string[] {
  const findings: string[] = []
  const text = canonicalize(publicReceipt).toLowerCase()
  for (const secret of privateStrings(bundle)) {
    if (secret.length >= 16 && text.includes(secret))
      findings.push(`private identifier ${secret.slice(0, 10)}… appears in public output`)
  }
  const walk = (value: unknown, path: string): void => {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (PRIVATE_KEYS.includes(key))
        findings.push(`private key "${path}${key}" appears in public output`)
      walk(child, `${path}${key}.`)
    }
  }
  walk(publicReceipt, '')
  return findings
}
