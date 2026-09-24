'use client'

import { CHAIN_DISPLAY, CLAIM_TYPE_DISPLAY, shortAddress } from '@then/core'
import type { IntakeResult, Proposed } from '@then/intake'
import { useId, useState } from 'react'
import { api } from '@/lib/client/api'
import { formatDay } from '@/lib/format'
import { COMPOSER_CLAIM_TYPES, type Draft, type DraftErrors } from './draft'

interface Row {
  key: string
  label: string
  value: string
  evidence: string
  /** The draft change this proposal makes; null when THEN will not use it. */
  patch: Partial<Draft> | null
  note?: string
}

function rowsOf(proposal: IntakeResult, lastSettled: string): Row[] {
  const rows: Row[] = []
  const add = <T,>(
    key: string,
    label: string,
    field: Proposed<T> | undefined,
    show: (value: T) => string,
    patch: (value: T) => Row['patch'],
    note?: (value: T) => string | undefined,
  ) => {
    if (!field) return
    const row: Row = {
      key,
      label,
      value: show(field.value),
      evidence: field.evidence,
      patch: patch(field.value),
    }
    const text = note?.(field.value)
    if (text) row.note = text
    rows.push(row)
  }
  add(
    'chain',
    'Chain',
    proposal.chain,
    (chain) => CHAIN_DISPLAY[chain],
    (chain) => ({ chain }),
  )
  if (proposal.token_address) {
    add('token', 'Token', proposal.token_address, shortAddress, (address) => ({
      token: { address, symbol: proposal.token_symbol?.value ?? null, name: null },
      tokenQuery: '',
    }))
  } else {
    add(
      'token',
      'Token',
      proposal.token_symbol,
      (symbol) => `$${symbol}`,
      (symbol) => ({ token: null, tokenQuery: symbol }),
      () => 'THEN will search for it. You pick the exact contract.',
    )
  }
  add(
    'date',
    'Date',
    proposal.as_of_date,
    formatDay,
    (date) => (date > lastSettled ? null : { date }),
    (date) =>
      date > lastSettled ? 'That day has not settled yet, so it cannot be stamped.' : undefined,
  )
  add(
    'window',
    'Window',
    proposal.window_hours,
    (hours) => (hours === 24 ? '1 day' : `${hours / 24} days`),
    (hours) =>
      hours % 24 === 0 && hours >= 24 && hours <= 168 ? { windowDays: hours / 24 } : null,
  )
  add(
    'claimType',
    'Claim',
    proposal.claim_type,
    (type) => CLAIM_TYPE_DISPLAY[type],
    (type) =>
      (COMPOSER_CLAIM_TYPES as readonly string[]).includes(type)
        ? { claimType: type as Draft['claimType'] }
        : null,
    (type) => (type === 'SM_PERP' ? 'Perp claims have no dated Nansen surface yet.' : undefined),
  )
  return rows
}

/**
 * Optional start from a post or link. The parser only proposes; each field changes when the user
 * says so, and a field they already set is never overwritten by "Fill empty fields".
 */
export function SourceIntake({
  draft,
  errors,
  lastSettled,
  onChange,
  onApply,
}: {
  draft: Draft
  errors: DraftErrors
  lastSettled: string
  onChange: (field: 'sourceUrl' | 'sourceText', value: string) => void
  onApply: (patch: Partial<Draft>) => void
}) {
  const urlId = useId()
  const textId = useId()
  const [reading, setReading] = useState(false)
  const [result, setResult] = useState<{ proposal: IntakeResult } | { error: string } | null>(null)

  const canRead = Boolean(draft.sourceUrl.trim() || draft.sourceText.trim()) && !reading
  const rows = result && 'proposal' in result ? rowsOf(result.proposal, lastSettled) : []
  const isEmpty = (key: string) =>
    key === 'chain'
      ? !draft.chain
      : key === 'token'
        ? !draft.token && !draft.tokenQuery.trim()
        : key === 'date'
          ? !draft.date
          : key === 'claimType'
            ? !draft.claimType
            : key === 'window'
              ? draft.windowDays === 1
              : false
  const fillable = rows.flatMap((row) => (row.patch && isEmpty(row.key) ? [row.patch] : []))

  async function read() {
    setReading(true)
    const response = await api<{ proposal: IntakeResult }>('/api/intake', {
      method: 'POST',
      json: {
        url: draft.sourceUrl.trim() || undefined,
        text: draft.sourceText.trim() || undefined,
      },
    })
    setReading(false)
    setResult(response.ok ? { proposal: response.data.proposal } : { error: response.message })
  }

  return (
    <div className="grid gap-6 border-t border-rule px-4 py-5 md:px-5 lg:grid-cols-2 lg:gap-10">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={urlId} className="t-meta">
            Link to the post (optional)
          </label>
          <input
            id={urlId}
            type="url"
            inputMode="url"
            placeholder="https://x.com/…"
            className="h-11 rounded-md border border-rule-strong bg-canvas px-3 text-[15px] text-ink placeholder:text-meta"
            value={draft.sourceUrl}
            aria-invalid={errors.sourceUrl ? true : undefined}
            aria-describedby={errors.sourceUrl ? `${urlId}-error` : undefined}
            onChange={(event) => onChange('sourceUrl', event.target.value)}
          />
          {errors.sourceUrl ? (
            <p id={`${urlId}-error`} className="t-ui font-medium text-ink">
              {errors.sourceUrl}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={textId} className="t-meta">
            Or paste the claim text
          </label>
          <textarea
            id={textId}
            rows={3}
            maxLength={2000}
            placeholder="Smart Money bought $BONK on Solana yesterday"
            className="rounded-md border border-rule-strong bg-canvas px-3 py-2.5 text-[15px] text-ink placeholder:text-meta"
            value={draft.sourceText}
            onChange={(event) => onChange('sourceText', event.target.value)}
          />
          <p className="t-ui text-meta">
            Receipts publish a hash of pasted text, never the text itself.
          </p>
        </div>
        <div>
          <button
            type="button"
            disabled={!canRead}
            onClick={read}
            className="t-ui inline-flex h-11 items-center rounded-md border border-rule-strong px-4 font-medium text-ink hover:bg-band disabled:text-meta disabled:hover:bg-transparent"
          >
            {reading ? 'Reading…' : 'Read claim'}
          </button>
        </div>
      </div>

      <div aria-live="polite">
        {result && 'error' in result ? <p className="t-ui text-ink">{result.error}</p> : null}
        {result && 'proposal' in result ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="t-ui font-medium text-ink">
                {rows.length > 0
                  ? 'Proposed from the source'
                  : 'Nothing could be read with confidence'}
              </p>
              {fillable.length > 0 ? (
                <button
                  type="button"
                  className="t-ui text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                  onClick={() =>
                    onApply(
                      fillable.reduce<Partial<Draft>>((all, patch) => ({ ...all, ...patch }), {}),
                    )
                  }
                >
                  Fill empty fields
                </button>
              ) : null}
            </div>
            {rows.length > 0 ? (
              <ul className="divide-y divide-rule border-y border-rule">
                {rows.map(({ patch, ...row }) => (
                  <li key={row.key} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="t-ui text-ink">
                        <span className="text-meta">{row.label}</span> {row.value}
                      </p>
                      <p className="t-meta mt-0.5 truncate" title={row.evidence}>
                        from “{row.evidence}”
                      </p>
                      {row.note ? <p className="t-ui mt-1 text-ink-soft">{row.note}</p> : null}
                    </div>
                    {patch ? (
                      <button
                        type="button"
                        className="t-ui h-9 shrink-0 rounded-md border border-rule-strong px-3 text-ink hover:bg-band"
                        onClick={() => onApply(patch)}
                      >
                        Use
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {!result.proposal.mentions_smart_money ? (
              <p className="t-ui text-ink-soft">
                The source does not mention Smart Money. THEN only checks Smart Money claims.
              </p>
            ) : null}
            {result.proposal.ambiguities.map((note) => (
              <p key={note} className="t-ui text-ink-soft">
                {note}
              </p>
            ))}
          </div>
        ) : null}
        {!result ? (
          <p className="t-ui max-w-[46ch] text-ink-soft">
            THEN reads the link or text and proposes chain, token, date, and claim type. Nothing
            changes in the form until you choose it.
          </p>
        ) : null}
      </div>
    </div>
  )
}
