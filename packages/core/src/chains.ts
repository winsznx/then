export const CHAINS = [
  'ethereum',
  'base',
  'solana',
  'bnb',
  'arbitrum',
  'monad',
  'robinhood',
] as const

export type Chain = (typeof CHAINS)[number]

const EVM_CHAINS: ReadonlySet<Chain> = new Set([
  'ethereum',
  'base',
  'bnb',
  'arbitrum',
  'monad',
  'robinhood',
])

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function isEvmChain(chain: Chain): boolean {
  return EVM_CHAINS.has(chain)
}

/** EVM addresses are case-insensitive and stored lowercase; Solana base58 is case-sensitive. */
export function normalizeTokenAddress(chain: Chain, address: string): string | null {
  const trimmed = address.trim()
  if (isEvmChain(chain)) {
    return EVM_ADDRESS.test(trimmed) ? trimmed.toLowerCase() : null
  }
  return SOLANA_ADDRESS.test(trimmed) ? trimmed : null
}

/**
 * Which Nansen surfaces exist per chain (OpenAPI 2026-09-24).
 * `wallet_history`: historical who-bought-sold / dex-trades / flow summary / top holders.
 * `sm_snapshot`: v1 smart-money/historical-holdings (token-filtered daily snapshots).
 * `trade`: Nansen Trading quote/prepare.
 */
export interface ChainCoverage {
  wallet_history: boolean
  sm_snapshot: boolean
  ohlcv_history: boolean
  trade: boolean
}

export const CHAIN_COVERAGE: Record<Chain, ChainCoverage> = {
  ethereum: { wallet_history: true, sm_snapshot: true, ohlcv_history: true, trade: false },
  base: { wallet_history: true, sm_snapshot: true, ohlcv_history: true, trade: true },
  solana: { wallet_history: true, sm_snapshot: true, ohlcv_history: true, trade: true },
  bnb: { wallet_history: true, sm_snapshot: true, ohlcv_history: true, trade: false },
  arbitrum: { wallet_history: false, sm_snapshot: false, ohlcv_history: false, trade: false },
  monad: { wallet_history: false, sm_snapshot: true, ohlcv_history: false, trade: false },
  robinhood: { wallet_history: false, sm_snapshot: true, ohlcv_history: false, trade: false },
}

export const CHAIN_DISPLAY: Record<Chain, string> = {
  ethereum: 'Ethereum',
  base: 'Base',
  solana: 'Solana',
  bnb: 'BNB Chain',
  arbitrum: 'Arbitrum',
  monad: 'Monad',
  robinhood: 'Robinhood Chain',
}
