/** Smart Money labels a claim may name. */
export const SM_LABELS = [
  'Smart Trader',
  '30D Smart Trader',
  '90D Smart Trader',
  '180D Smart Trader',
  'Smart HL Perps Trader',
  'Fund',
] as const

export type SmLabel = (typeof SM_LABELS)[number]

export const DEFAULT_SM_LABEL_SET: readonly SmLabel[] = [
  'Smart Trader',
  '30D Smart Trader',
  '90D Smart Trader',
  '180D Smart Trader',
  'Smart HL Perps Trader',
]

/**
 * Historical label enums carry legacy names for the same classes. Querying history with only the
 * current name would count a renamed wallet as non-Smart-Money then and Smart Money now, which
 * manufactures contamination out of a rename.
 */
export const LEGACY_LABEL_ALIASES: Readonly<Partial<Record<SmLabel, readonly string[]>>> = {
  'Smart Trader': ['Smart Dex Trader'],
  '30D Smart Trader': ['30D Smart Dex Trader'],
  '90D Smart Trader': ['90D Smart Dex Trader'],
  '180D Smart Trader': ['180D Smart Dex Trader'],
}

export const LABEL_ALIAS_POLICY_VERSION = '2026-09-24'

/** Fund wallets left the upstream Smart Money cohort on this date. */
export const FUND_COHORT_EXIT_DATE = '2026-09-09'
export const FUND_POLICY_VERSION = FUND_COHORT_EXIT_DATE

export function normalizeLabelSet(labels: readonly SmLabel[]): SmLabel[] {
  return [...new Set(labels)].sort((a, b) => SM_LABELS.indexOf(a) - SM_LABELS.indexOf(b))
}

/** Labels sent to point-in-time endpoints: the requested set plus legacy aliases. */
export function asofLabelFilter(labels: readonly SmLabel[]): string[] {
  const out = new Set<string>()
  for (const label of normalizeLabelSet(labels)) {
    out.add(label)
    for (const alias of LEGACY_LABEL_ALIASES[label] ?? []) out.add(alias)
  }
  return [...out]
}

/** Labels sent to current-label endpoints. Fund is never sent: it is no longer part of the cohort. */
export function liveLabelFilter(labels: readonly SmLabel[]): SmLabel[] {
  return normalizeLabelSet(labels).filter((label) => label !== 'Fund')
}

export function fundIncluded(labels: readonly SmLabel[]): boolean {
  return labels.includes('Fund')
}
