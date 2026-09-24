import {
  CHAINS,
  DEFAULT_MIN_USD,
  isIsoDate,
  normalizeTokenAddress,
  type Chain,
  type ClaimInput,
  type ClaimType,
  type PublicClaim,
} from '@then/core'
import type { TokenChoice } from './token-field'

/** Claim types the composer offers. Perp claims have no dated Nansen surface yet. */
export const COMPOSER_CLAIM_TYPES = [
  'SM_BOUGHT',
  'SM_SOLD',
  'SM_HOLDS',
] as const satisfies readonly ClaimType[]

export interface Draft {
  chain: Chain | ''
  token: TokenChoice | null
  tokenQuery: string
  date: string
  claimType: ClaimType | ''
  windowDays: number
  minUsd: string
  sourceUrl: string
  sourceText: string
}

export type DraftField =
  'chain' | 'token' | 'date' | 'claimType' | 'minUsd' | 'sourceUrl' | 'sourceText'

export type DraftErrors = Partial<Record<DraftField, string>>

export const EMPTY_DRAFT: Draft = {
  chain: '',
  token: null,
  tokenQuery: '',
  date: '',
  claimType: '',
  windowDays: 1,
  minUsd: String(DEFAULT_MIN_USD),
  sourceUrl: '',
  sourceText: '',
}

export function draftFromClaim(claim: PublicClaim): Draft {
  return {
    ...EMPTY_DRAFT,
    chain: claim.chain,
    token: { address: claim.token_address, symbol: claim.token_symbol ?? null, name: null },
    date: claim.as_of_date,
    claimType: claim.claim_type,
    windowDays: claim.window_hours / 24,
    minUsd: String(claim.min_usd),
  }
}

type Params = Record<string, string | string[] | undefined>

function param(params: Params, key: string): string {
  const value = params[key]
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

/** Prefill from a link such as /inspect?chain=solana&token=…&date=…&claim=SM_BOUGHT. Nothing is stamped. */
export function draftFromParams(params: Params): Draft | null {
  const chain = (CHAINS as readonly string[]).includes(param(params, 'chain'))
    ? (param(params, 'chain') as Chain)
    : ''
  const claimType = (COMPOSER_CLAIM_TYPES as readonly string[]).includes(param(params, 'claim'))
    ? (param(params, 'claim') as ClaimType)
    : ''
  const date = isIsoDate(param(params, 'date')) ? param(params, 'date') : ''
  const address = chain ? normalizeTokenAddress(chain, param(params, 'token')) : null
  const symbol = param(params, 'symbol').replace(/^\$/, '').slice(0, 32) || null
  if (!chain && !claimType && !date && !address) return null
  return {
    ...EMPTY_DRAFT,
    chain,
    claimType,
    date,
    token: address ? { address, symbol, name: null } : null,
  }
}

export function validateDraft(draft: Draft, lastSettled: string): DraftErrors {
  const errors: DraftErrors = {}
  if (!draft.chain) errors.chain = 'Pick a chain.'
  if (!draft.token)
    errors.token = draft.tokenQuery.trim()
      ? 'Choose a token from the list, or paste its contract address.'
      : 'Search for the token or paste its contract address.'
  if (!draft.date) errors.date = 'Pick the day the claim is about.'
  else if (!isIsoDate(draft.date)) errors.date = 'Use a real calendar date.'
  else if (draft.date > lastSettled)
    errors.date = `That day has not settled. The latest settled UTC day is ${lastSettled}.`
  if (!draft.claimType) errors.claimType = 'Pick what the claim says Smart Money did.'
  const minUsd = Number(draft.minUsd)
  if (!Number.isFinite(minUsd) || minUsd <= 0) errors.minUsd = 'Enter a positive dollar amount.'
  if (draft.sourceUrl.trim() && !/^https?:\/\/\S+$/i.test(draft.sourceUrl.trim()))
    errors.sourceUrl = 'Use a full http(s) link.'
  return errors
}

/** The request body for a draft that passed validation; null while a required field is missing. */
export function toClaimInput(draft: Draft): ClaimInput | null {
  if (!draft.chain || !draft.token || !draft.claimType) return null
  const input: ClaimInput = {
    claim_type: draft.claimType,
    chain: draft.chain,
    token_address: draft.token.address,
    as_of_date: draft.date,
    window_hours: draft.windowDays * 24,
    min_usd: Number(draft.minUsd),
  }
  if (draft.token.symbol) input.token_symbol = draft.token.symbol
  if (draft.sourceUrl.trim()) input.source_url = draft.sourceUrl.trim()
  if (draft.sourceText.trim()) input.source_text = draft.sourceText.trim()
  return input
}

const ISSUE_FIELDS: Record<string, DraftField> = {
  chain: 'chain',
  token_address: 'token',
  token_symbol: 'token',
  as_of_date: 'date',
  claim_type: 'claimType',
  min_usd: 'minUsd',
  source_url: 'sourceUrl',
  source_text: 'sourceText',
}

/** Server-side validation issues, placed next to the field they belong to. */
export function errorsFromIssues(issues: { path: string; message: string }[]): DraftErrors {
  const errors: DraftErrors = {}
  for (const issue of issues) {
    const field = ISSUE_FIELDS[issue.path.split('.')[0] ?? '']
    if (field && !errors[field])
      errors[field] = issue.message.charAt(0).toUpperCase() + issue.message.slice(1)
  }
  return errors
}
