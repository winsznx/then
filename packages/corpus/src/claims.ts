import { CHAINS, CLAIM_TYPES, isIsoDate } from '@then/core'
import { z } from 'zod'

/** One line of eval/corpus/claims.jsonl, as frozen in SELECTION.md. */
export const CorpusClaimSchema = z.object({
  claim_id: z.string().regex(/^pub_\d{3,}$/),
  source_url: z.string().min(1),
  source_kind: z.string(),
  source_author: z.string(),
  source_published_at: z.string(),
  source_captured_at: z.string(),
  quote: z.string().min(1),
  claim_type: z.enum(CLAIM_TYPES),
  chain: z.string(),
  token_symbol: z.string(),
  token_address: z.string(),
  token_address_source: z.string(),
  as_of_date: z.string().refine(isIsoDate),
  window_hours: z.number().int(),
  date_rule: z.string(),
  selection_role: z.enum(['general', 'control', 'later_drawdown']),
  notes: z.string(),
})
export type CorpusClaim = z.infer<typeof CorpusClaimSchema>

export interface CorpusLoadResult {
  claims: CorpusClaim[]
  invalid: { line: number; error: string }[]
}

export function parseCorpus(text: string): CorpusLoadResult {
  const claims: CorpusClaim[] = []
  const invalid: CorpusLoadResult['invalid'] = []
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim()
    if (!line) return
    try {
      const parsed = CorpusClaimSchema.safeParse(JSON.parse(line))
      if (parsed.success) claims.push(parsed.data)
      else
        invalid.push({
          line: index + 1,
          error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        })
    } catch (error) {
      invalid.push({
        line: index + 1,
        error: error instanceof Error ? error.message : 'invalid JSON',
      })
    }
  })
  return { claims, invalid }
}

export function isSupportedChain(chain: string): chain is (typeof CHAINS)[number] {
  return (CHAINS as readonly string[]).includes(chain)
}
