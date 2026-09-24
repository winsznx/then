/**
 * Claim intake: a URL and/or pasted text → proposed claim fields. Heuristic and advisory. The
 * user confirms every field before a stamp, ambiguity proposes nothing, and nothing here can
 * express a verdict.
 */
import { addDays, isIsoDate, normalizeTokenAddress, type Chain, type ClaimType } from '@then/core'

export type Confidence = 'high' | 'medium' | 'low'

export interface Proposed<T> {
  value: T
  confidence: Confidence
  /** The text or URL fragment the value came from. */
  evidence: string
}

export interface IntakeResult {
  chain?: Proposed<Chain>
  token_address?: Proposed<string>
  token_symbol?: Proposed<string>
  as_of_date?: Proposed<string>
  window_hours?: Proposed<number>
  claim_type?: Proposed<ClaimType>
  mentions_smart_money: boolean
  /** Reasons a field was left empty on purpose. */
  ambiguities: string[]
}

export interface IntakeInput {
  text?: string
  url?: string
  /** The day the claim was published, or today (UTC). Relative dates count back from it. */
  reference_date: string
}

const CHAIN_WORDS: [RegExp, Chain][] = [
  [/\b(solana|sol chain|on sol)\b/i, 'solana'],
  [/\b(ethereum|eth mainnet|mainnet eth|on eth)\b/i, 'ethereum'],
  [/\bbase\b(?! (?:case|layer|rate|price|line))/i, 'base'],
  [/\b(bnb chain|bsc|binance smart chain|bnb smart chain)\b/i, 'bnb'],
  [/\b(arbitrum|arb one)\b/i, 'arbitrum'],
  [/\bmonad\b/i, 'monad'],
  [/\brobinhood chain\b/i, 'robinhood'],
]

const EXPLORERS: [RegExp, Chain][] = [
  [/(?:^|\.)etherscan\.io$/i, 'ethereum'],
  [/(?:^|\.)basescan\.org$/i, 'base'],
  [/(?:^|\.)bscscan\.com$/i, 'bnb'],
  [/(?:^|\.)arbiscan\.io$/i, 'arbitrum'],
  [/(?:^|\.)solscan\.io$/i, 'solana'],
  [/(?:^|\.)explorer\.solana\.com$/i, 'solana'],
]

const TYPE_WORDS: [RegExp, ClaimType][] = [
  [/\b(perps?|longs?|shorts?|longing|shorting|open interest|leverag\w*)\b/i, 'SM_PERP'],
  [
    /\b(sold|selling|sells|dump\w*|distribut\w*|offload\w*|outflows?|exit(ed|ing)?|trimm\w*)\b/i,
    'SM_SOLD',
  ],
  [
    /\b(bought|buying|buys|accumulat\w*|load(ed|ing)? up|aped?|aping|inflows?|scoop\w*|added|adding)\b/i,
    'SM_BOUGHT',
  ],
  [/\b(hold(s|ing)?|held|top holdings?|positioned|bag(s)? of)\b/i, 'SM_HOLDS'],
]

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const EVM_ADDRESS = /\b0x[0-9a-fA-F]{40}\b/g
const BASE58_ADDRESS = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g
const TICKER = /\$([A-Za-z][A-Za-z0-9]{1,14})\b/g

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function fromUrl(url: string, result: IntakeResult): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    result.ambiguities.push('the link is not a valid URL')
    return
  }
  const host = parsed.hostname.toLowerCase()
  const path = parsed.pathname

  const explorer = EXPLORERS.find(([pattern]) => pattern.test(host))
  if (explorer) {
    result.chain = { value: explorer[1], confidence: 'high', evidence: host }
    const token = /\/(?:token|address)\/([^/?#]+)/i.exec(path)?.[1]
    const address = token ? normalizeTokenAddress(explorer[1], token) : null
    if (address)
      result.token_address = { value: address, confidence: 'high', evidence: `${host}${path}` }
    return
  }

  if (host.endsWith('nansen.ai')) {
    const chain = parsed.searchParams.get('chain')?.toLowerCase()
    const token =
      parsed.searchParams.get('tokenAddress') ?? parsed.searchParams.get('token_address')
    const known =
      chain &&
      ['ethereum', 'base', 'solana', 'bnb', 'arbitrum', 'monad', 'robinhood'].includes(chain)
        ? (chain as Chain)
        : null
    if (known) result.chain = { value: known, confidence: 'high', evidence: `chain=${chain}` }
    if (known && token) {
      const address = normalizeTokenAddress(known, token)
      if (address)
        result.token_address = {
          value: address,
          confidence: 'high',
          evidence: `tokenAddress=${token}`,
        }
    }
    return
  }

  if (host.endsWith('dexscreener.com')) {
    const chain = path.split('/')[1]?.toLowerCase()
    const map: Record<string, Chain> = {
      solana: 'solana',
      ethereum: 'ethereum',
      base: 'base',
      bsc: 'bnb',
      arbitrum: 'arbitrum',
      monad: 'monad',
    }
    if (chain && map[chain])
      result.chain = { value: map[chain], confidence: 'high', evidence: `dexscreener /${chain}` }
    // Dexscreener paths carry pair addresses, not token addresses: never proposed as the token.
    if (path.split('/')[2])
      result.ambiguities.push('the Dexscreener link names a trading pair, not the token contract')
  }
}

function inferDate(
  text: string,
  reference: string,
): { date?: Proposed<string>; window?: Proposed<number> } {
  const iso = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(text)
  if (iso?.[1] && isIsoDate(iso[1]))
    return { date: { value: iso[1], confidence: 'high', evidence: iso[1] } }

  const monthFirst =
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i.exec(
      text,
    )
  const dayFirst =
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:,?\s+(20\d{2}))?\b/i.exec(
      text,
    )
  const named = monthFirst
    ? { month: monthFirst[1]!, day: monthFirst[2]!, year: monthFirst[3], evidence: monthFirst[0] }
    : dayFirst
      ? { month: dayFirst[2]!, day: dayFirst[1]!, year: dayFirst[3], evidence: dayFirst[0] }
      : null
  if (named) {
    const month = MONTHS.indexOf(named.month.slice(0, 3).toLowerCase()) + 1
    const year = named.year ? Number(named.year) : Number(reference.slice(0, 4))
    let date = `${year}-${String(month).padStart(2, '0')}-${named.day.padStart(2, '0')}`
    if (!named.year && date > reference) date = `${year - 1}${date.slice(4)}`
    if (isIsoDate(date))
      return {
        date: { value: date, confidence: named.year ? 'high' : 'medium', evidence: named.evidence },
      }
  }

  const lower = text.toLowerCase()
  const days = /\b(?:past|last)\s+(\d)\s+days?\b/.exec(lower)
  if (days?.[1]) {
    const n = Math.min(Number(days[1]), 7)
    return {
      date: { value: addDays(reference, -1), confidence: 'medium', evidence: days[0] },
      window: { value: n * 24, confidence: 'medium', evidence: days[0] },
    }
  }
  if (/\b(this week|past week|last week|7 days|7d)\b/.test(lower)) {
    return {
      date: { value: addDays(reference, -1), confidence: 'low', evidence: 'week' },
      window: { value: 168, confidence: 'medium', evidence: 'week' },
    }
  }
  if (/\b(yesterday)\b/.test(lower))
    return { date: { value: addDays(reference, -1), confidence: 'high', evidence: 'yesterday' } }
  if (/\b(last|past)\s+(24\s*h(ou)?rs?|24h|day)\b/.test(lower)) {
    return {
      date: { value: addDays(reference, -1), confidence: 'medium', evidence: 'last 24 hours' },
    }
  }
  if (/\btoday\b/.test(lower))
    return { date: { value: reference, confidence: 'medium', evidence: 'today' } }
  const weekday = WEEKDAYS.findIndex((name) => new RegExp(`\\b(on\\s+)?${name}\\b`).test(lower))
  if (weekday >= 0) {
    const refDay = new Date(`${reference}T00:00:00Z`).getUTCDay()
    const back = (refDay - weekday + 7) % 7 || 7
    return {
      date: {
        value: addDays(reference, -back),
        confidence: 'medium',
        evidence: WEEKDAYS[weekday]!,
      },
    }
  }
  return {}
}

export function parseIntake(input: IntakeInput): IntakeResult {
  const result: IntakeResult = { mentions_smart_money: false, ambiguities: [] }
  if (input.url) fromUrl(input.url.trim(), result)
  const text = input.text ?? ''
  if (!text.trim()) return result

  result.mentions_smart_money = /\b(smart money|smart traders?|smart dex traders?|\bsm\b)/i.test(
    text,
  )

  if (!result.chain) {
    const chains = unique(
      CHAIN_WORDS.filter(([pattern]) => pattern.test(text)).map(([, chain]) => chain),
    )
    if (chains.length === 1)
      result.chain = { value: chains[0]!, confidence: 'medium', evidence: chains[0]! }
    else if (chains.length > 1)
      result.ambiguities.push(`several chains mentioned: ${chains.join(', ')}`)
  }

  if (!result.token_address) {
    const evm = unique(text.match(EVM_ADDRESS) ?? [])
    const base58 = unique(
      (text.match(BASE58_ADDRESS) ?? []).filter(
        (candidate) => /\d/.test(candidate) && /[A-Z]/.test(candidate) && /[a-z]/.test(candidate),
      ),
    )
    if (evm.length + base58.length > 1) {
      result.ambiguities.push('more than one contract address in the text')
    } else if (evm[0]) {
      result.token_address = { value: evm[0].toLowerCase(), confidence: 'high', evidence: evm[0] }
      if (!result.chain) result.ambiguities.push('an EVM address fits several chains; pick one')
    } else if (base58[0]) {
      result.token_address = { value: base58[0], confidence: 'high', evidence: base58[0] }
      if (!result.chain)
        result.chain = { value: 'solana', confidence: 'medium', evidence: 'Solana-format address' }
    }
  }

  const tickers = unique([...text.matchAll(TICKER)].map((match) => match[1]!.toUpperCase()))
  if (tickers.length === 1)
    result.token_symbol = { value: tickers[0]!, confidence: 'high', evidence: `$${tickers[0]}` }
  else if (tickers.length > 1)
    result.ambiguities.push(`several tickers: ${tickers.map((t) => `$${t}`).join(', ')}`)

  const types = unique(TYPE_WORDS.filter(([pattern]) => pattern.test(text)).map(([, type]) => type))
  const directional = types.filter((type) => type === 'SM_BOUGHT' || type === 'SM_SOLD')
  if (directional.length > 1) {
    result.ambiguities.push('the text says both bought and sold')
  } else if (types.includes('SM_PERP')) {
    result.claim_type = { value: 'SM_PERP', confidence: 'medium', evidence: 'perp wording' }
  } else if (types[0]) {
    const word = TYPE_WORDS.find(([, type]) => type === types[0])![0].exec(text)?.[0] ?? types[0]
    result.claim_type = {
      value: types[0],
      confidence: types.length === 1 ? 'high' : 'medium',
      evidence: word,
    }
  }

  const { date, window } = inferDate(text, input.reference_date)
  if (date) result.as_of_date = date
  if (window) result.window_hours = window
  return result
}
