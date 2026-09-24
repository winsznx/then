import { CLAIM_TYPE_VERB, shortAddress, type ClaimType } from '@then/core'

/** "Smart Money bought $WIF on 2026-06-12", with the date kept on one line. */
export function ClaimSentence({
  claim,
}: {
  claim: {
    claim_type: ClaimType
    token_symbol?: string | null | undefined
    token_address: string
    as_of_date: string
  }
}) {
  const token = claim.token_symbol ? `$${claim.token_symbol}` : shortAddress(claim.token_address)
  return (
    <>
      Smart Money {CLAIM_TYPE_VERB[claim.claim_type]} {token} on{' '}
      <span className="whitespace-nowrap">{claim.as_of_date}</span>
    </>
  )
}
