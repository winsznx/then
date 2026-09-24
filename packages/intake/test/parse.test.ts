import { describe, expect, it } from 'vitest'
import { parseIntake } from '../src'

const REF = '2026-06-13'
const WIF = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'
const PEPE = '0x6982508145454ce325ddbe47a25d4ec3d2311933'

describe('parseIntake', () => {
  it('reads a ticker, a buy claim, and a named date', () => {
    // #when
    const result = parseIntake({ text: 'Smart Money bought $WIF on June 12', reference_date: REF })
    // #then
    expect({
      symbol: result.token_symbol?.value,
      type: result.claim_type?.value,
      date: result.as_of_date?.value,
      sm: result.mentions_smart_money,
    }).toEqual({ symbol: 'WIF', type: 'SM_BOUGHT', date: '2026-06-12', sm: true })
  })

  it('reads a sell claim', () => {
    // #when
    const result = parseIntake({
      text: 'smart money dumping $BONK hard today',
      reference_date: REF,
    })
    // #then
    expect(result.claim_type?.value).toBe('SM_SOLD')
  })

  it('reads a holds claim', () => {
    // #when
    const result = parseIntake({
      text: 'Smart Money still holding $JUP as a top holding',
      reference_date: REF,
    })
    // #then
    expect(result.claim_type?.value).toBe('SM_HOLDS')
  })

  it('refuses to pick a direction when the text says both bought and sold', () => {
    // #when
    const result = parseIntake({
      text: 'Smart Money bought $WIF and sold $WIF',
      reference_date: REF,
    })
    // #then
    expect({ type: result.claim_type, ambiguous: result.ambiguities.length > 0 }).toEqual({
      type: undefined,
      ambiguous: true,
    })
  })

  it('proposes no token when several tickers appear', () => {
    // #when
    const result = parseIntake({
      text: 'Smart money rotating from $WIF into $BONK',
      reference_date: REF,
    })
    // #then
    expect({
      symbol: result.token_symbol,
      ambiguous: result.ambiguities.some((a) => a.includes('tickers')),
    }).toEqual({
      symbol: undefined,
      ambiguous: true,
    })
  })

  it('takes chain and token from a Solscan link', () => {
    // #when
    const result = parseIntake({ url: `https://solscan.io/token/${WIF}`, reference_date: REF })
    // #then
    expect({ chain: result.chain?.value, token: result.token_address?.value }).toEqual({
      chain: 'solana',
      token: WIF,
    })
  })

  it('takes chain and token from an Etherscan link and lowercases the address', () => {
    // #when
    const result = parseIntake({
      url: `https://etherscan.io/token/${PEPE.toUpperCase().replace('0X', '0x')}`,
      reference_date: REF,
    })
    // #then
    expect({ chain: result.chain?.value, token: result.token_address?.value }).toEqual({
      chain: 'ethereum',
      token: PEPE,
    })
  })

  it('takes chain and token from a Nansen Token God Mode link', () => {
    // #when
    const result = parseIntake({
      url: `https://app.nansen.ai/token-god-mode?chain=solana&tokenAddress=${WIF}`,
      reference_date: REF,
    })
    // #then
    expect({ chain: result.chain?.value, token: result.token_address?.value }).toEqual({
      chain: 'solana',
      token: WIF,
    })
  })

  it('never treats a Dexscreener pair address as the token', () => {
    // #when
    const result = parseIntake({
      url: `https://dexscreener.com/solana/${WIF}`,
      reference_date: REF,
    })
    // #then
    expect({ chain: result.chain?.value, token: result.token_address }).toEqual({
      chain: 'solana',
      token: undefined,
    })
  })

  it('infers Solana from a base58 address in text', () => {
    // #when
    const result = parseIntake({ text: `smart money loading ${WIF}`, reference_date: REF })
    // #then
    expect({ chain: result.chain?.value, token: result.token_address?.value }).toEqual({
      chain: 'solana',
      token: WIF,
    })
  })

  it('does not guess the chain for a bare EVM address', () => {
    // #when
    const result = parseIntake({ text: `smart money bought ${PEPE}`, reference_date: REF })
    // #then
    expect({
      chain: result.chain,
      flagged: result.ambiguities.some((a) => a.includes('EVM')),
    }).toEqual({ chain: undefined, flagged: true })
  })

  it('maps "last 24 hours" to the day before the reference date', () => {
    // #when
    const result = parseIntake({
      text: 'Smart money bought $WIF in the last 24 hours',
      reference_date: REF,
    })
    // #then
    expect(result.as_of_date?.value).toBe('2026-06-12')
  })

  it('maps a weekday to the most recent such day before the reference', () => {
    // #given 2026-06-13 is a Saturday
    // #when
    const result = parseIntake({ text: 'Smart money bought $WIF on Tuesday', reference_date: REF })
    // #then
    expect(result.as_of_date?.value).toBe('2026-06-09')
  })

  it('rolls a yearless date that would be in the future back one year', () => {
    // #when
    const result = parseIntake({ text: 'Smart money bought $WIF on Dec 20', reference_date: REF })
    // #then
    expect(result.as_of_date?.value).toBe('2025-12-20')
  })

  it('reads a multi-day window', () => {
    // #when
    const result = parseIntake({
      text: 'Smart money accumulated $WIF over the past 3 days',
      reference_date: REF,
    })
    // #then
    expect({ window: result.window_hours?.value, date: result.as_of_date?.value }).toEqual({
      window: 72,
      date: '2026-06-12',
    })
  })

  it('returns no verdict field at all', () => {
    // #when
    const result = parseIntake({
      text: 'Smart Money bought $WIF on June 12 — this is VALID',
      reference_date: REF,
    })
    // #then
    expect(Object.keys(result).some((key) => /verdict/i.test(key))).toBe(false)
  })
})
