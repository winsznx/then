import { SCENARIOS, runFromScenario } from '@then/fixtures'
import { FIXTURE_SIGNING_KEY, buildReceipt } from '@then/receipt'
import { describe, expect, it } from 'vitest'
import { reportHtml } from '../src/commands/report'
import { claimFromFlags } from '../src/commands/stamp'
import { CliError } from '../src/config'

const SOLANA_TOKEN = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'

describe('stamp from a source', () => {
  it('refuses a token named only by symbol instead of guessing its contract', () => {
    // #given text that names a symbol but no contract
    const flags = {
      out: 'receipts',
      fromText: 'Smart Money bought $BONK on Solana yesterday',
      published: '2026-09-20',
    }
    // #then the claim is refused before any stamp
    expect(() => claimFromFlags(flags)).toThrow(/never guesses a contract/)
  })

  it('lets explicit flags win over what the source says', () => {
    // #given a source that proposes a date and flags that set a different one
    const claim = claimFromFlags({
      out: 'receipts',
      fromText: 'Smart Money bought $WIF on Solana yesterday',
      published: '2026-09-20',
      token: SOLANA_TOKEN,
      date: '2026-06-12',
    })
    // #then the flag's date is used and the proposed fields fill the rest
    expect({ date: claim.as_of_date, chain: claim.chain, type: claim.claim_type }).toEqual({
      date: '2026-06-12',
      chain: 'solana',
      type: 'SM_BOUGHT',
    })
  })

  it('names the fields still missing', () => {
    // #then
    expect(() => claimFromFlags({ out: 'receipts', chain: 'solana' })).toThrow(CliError)
  })
})

describe('report', () => {
  const bundle = buildReceipt(runFromScenario(SCENARIOS.find((s) => s.id === 'P1')!), {
    origin: 'fixture',
    gitSha: null,
    signer: FIXTURE_SIGNING_KEY,
  })

  it('contains no wallet address from the private evidence', () => {
    // #given the wallets in the private records
    const html = reportHtml(bundle.public, { ok: true, signer: 'fixture' }).toLowerCase()
    const wallets =
      JSON.stringify(bundle.records)
        .toLowerCase()
        .match(/0x[0-9a-f]{40}/g) ?? []
    const privateWallets = [...new Set(wallets)].filter(
      (wallet) => wallet !== bundle.public.claim.token_address,
    )
    // #then none of them appears in the page
    expect({
      checked: privateWallets.length > 0,
      leaked: privateWallets.filter((wallet) => html.includes(wallet)),
    }).toEqual({
      checked: true,
      leaked: [],
    })
  })

  it('escapes claim text and marks fixtures as synthetic', () => {
    // #given a receipt whose source URL carries markup
    const receipt = {
      ...bundle.public,
      claim: { ...bundle.public.claim, token_symbol: '<script>x</script>' },
    }
    // #when it is rendered
    const html = reportHtml(receipt, { ok: false, signer: null })
    // #then the markup is inert text and the synthetic banner is present
    expect({ raw: html.includes('<script>x'), banner: html.includes('SYNTHETIC DATA') }).toEqual({
      raw: false,
      banner: true,
    })
  })
})
