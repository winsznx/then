import { z } from 'zod'
import { hashCanonical, sha256Hex } from './canonical'
import { CHAINS, normalizeTokenAddress, type Chain } from './chains'
import { isIsoDate } from './dates'
import {
  DEFAULT_SM_LABEL_SET,
  FUND_COHORT_EXIT_DATE,
  SM_LABELS,
  normalizeLabelSet,
  type SmLabel,
} from './labels'

export const CLAIM_TYPES = ['SM_BOUGHT', 'SM_SOLD', 'SM_HOLDS', 'SM_PERP'] as const
export type ClaimType = (typeof CLAIM_TYPES)[number]

export const CLAIM_TYPE_DISPLAY: Record<ClaimType, string> = {
  SM_BOUGHT: 'Bought / accumulated',
  SM_SOLD: 'Sold / distributed',
  SM_HOLDS: 'Held a material position',
  SM_PERP: 'Perp positioning',
}

export const CLAIM_TYPE_VERB: Record<ClaimType, string> = {
  SM_BOUGHT: 'bought',
  SM_SOLD: 'sold',
  SM_HOLDS: 'held',
  SM_PERP: 'positioned in',
}

export const DEFAULT_MIN_USD = 1000
export const MAX_WINDOW_HOURS = 168

const isoDate = z.string().refine(isIsoDate, 'expected a calendar date as YYYY-MM-DD')

/** What a caller may send. Omitted fields take the documented defaults. */
export const ClaimInputSchema = z.strictObject({
  claim_type: z.enum(CLAIM_TYPES),
  chain: z.enum(CHAINS),
  token_address: z.string().trim().min(1).max(128),
  token_symbol: z.string().trim().min(1).max(32).optional(),
  as_of_date: isoDate,
  window_hours: z
    .number()
    .int()
    .min(24)
    .max(MAX_WINDOW_HOURS)
    .refine((hours) => hours % 24 === 0, 'window_hours must be whole days')
    .default(24),
  sm_label_set: z
    .array(z.enum(SM_LABELS))
    .min(1)
    .default(() => [...DEFAULT_SM_LABEL_SET]),
  min_usd: z.number().positive().max(1_000_000_000).default(DEFAULT_MIN_USD),
  quote_asset: z.literal('USD').default('USD'),
  source_url: z
    .url({ protocol: /^https?$/ })
    .max(2048)
    .optional(),
  source_text: z.string().trim().min(1).max(2000).optional(),
})

export type ClaimInput = z.input<typeof ClaimInputSchema>

export interface Claim {
  claim_type: ClaimType
  chain: Chain
  token_address: string
  token_symbol?: string
  as_of_date: string
  window_hours: number
  sm_label_set: SmLabel[]
  min_usd: number
  quote_asset: 'USD'
  source_url?: string
  source_text?: string
}

export type ClaimParseResult =
  { ok: true; claim: Claim } | { ok: false; issues: { path: string; message: string }[] }

export function parseClaim(input: unknown): ClaimParseResult {
  const parsed = ClaimInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    }
  }
  const value = parsed.data
  const tokenAddress = normalizeTokenAddress(value.chain, value.token_address)
  if (!tokenAddress) {
    return {
      ok: false,
      issues: [{ path: 'token_address', message: `not a valid ${value.chain} token address` }],
    }
  }
  if (value.sm_label_set.includes('Fund') && value.as_of_date >= FUND_COHORT_EXIT_DATE) {
    return {
      ok: false,
      issues: [
        {
          path: 'sm_label_set',
          message: `Fund wallets left the Smart Money cohort on ${FUND_COHORT_EXIT_DATE}; Fund is only valid for earlier dates`,
        },
      ],
    }
  }
  const claim: Claim = {
    claim_type: value.claim_type,
    chain: value.chain,
    token_address: tokenAddress,
    as_of_date: value.as_of_date,
    window_hours: value.window_hours,
    sm_label_set: normalizeLabelSet(value.sm_label_set),
    min_usd: value.min_usd,
    quote_asset: 'USD',
  }
  if (value.token_symbol) claim.token_symbol = value.token_symbol
  if (value.source_url) claim.source_url = value.source_url
  if (value.source_text) claim.source_text = value.source_text
  return { ok: true, claim }
}

export type EvaluationKey = Omit<Claim, 'token_symbol' | 'source_url' | 'source_text'>

/** The fields that decide a verdict. Two claims with the same key reuse the same Nansen payloads. */
export function evaluationKey(claim: Claim): EvaluationKey {
  return {
    claim_type: claim.claim_type,
    chain: claim.chain,
    token_address: claim.token_address,
    as_of_date: claim.as_of_date,
    window_hours: claim.window_hours,
    sm_label_set: normalizeLabelSet(claim.sm_label_set),
    min_usd: claim.min_usd,
    quote_asset: claim.quote_asset,
  }
}

/**
 * The claim as it may appear in public. Pasted source text can be private, so only its hash is
 * published; the claim hash still commits to it.
 */
export interface PublicClaim {
  claim_type: ClaimType
  chain: Chain
  token_address: string
  token_symbol?: string
  as_of_date: string
  window_hours: number
  sm_label_set: SmLabel[]
  min_usd: number
  quote_asset: 'USD'
  source_url?: string
  source_text_sha256?: string
}

export function publicClaimOf(claim: Claim): PublicClaim {
  const out: PublicClaim = {
    claim_type: claim.claim_type,
    chain: claim.chain,
    token_address: claim.token_address,
    as_of_date: claim.as_of_date,
    window_hours: claim.window_hours,
    sm_label_set: normalizeLabelSet(claim.sm_label_set),
    min_usd: claim.min_usd,
    quote_asset: claim.quote_asset,
  }
  if (claim.token_symbol) out.token_symbol = claim.token_symbol
  if (claim.source_url) out.source_url = claim.source_url
  if (claim.source_text) out.source_text_sha256 = `sha256:${sha256Hex(claim.source_text)}`
  return out
}

/** sha256 of the canonical public claim. Recomputable by anyone holding the public receipt. */
export function claimHash(claim: Claim): string {
  return publicClaimHash(publicClaimOf(claim))
}

export function publicClaimHash(claim: PublicClaim): string {
  return hashCanonical({ ...claim, sm_label_set: normalizeLabelSet(claim.sm_label_set) })
}

export function evaluationHash(claim: Claim): string {
  return hashCanonical(evaluationKey(claim))
}

/** "Smart Money bought $WIF on 2026-06-12" */
export function claimSentence(
  claim: Pick<Claim, 'claim_type' | 'token_symbol' | 'token_address' | 'as_of_date'>,
): string {
  const token = claim.token_symbol ? `$${claim.token_symbol}` : shortAddress(claim.token_address)
  return `Smart Money ${CLAIM_TYPE_VERB[claim.claim_type]} ${token} on ${claim.as_of_date}`
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}
