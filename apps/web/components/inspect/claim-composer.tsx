'use client'

import {
  CHAIN_COVERAGE,
  CHAIN_DISPLAY,
  CHAINS,
  CLAIM_TYPE_DISPLAY,
  type Chain,
  type ClaimInput,
} from '@then/core'
import { useId, useState } from 'react'
import { ChevronIcon } from '@/components/icons'
import { formatDay, usdFull } from '@/lib/format'
import {
  COMPOSER_CLAIM_TYPES,
  toClaimInput,
  validateDraft,
  type Draft,
  type DraftErrors,
  type DraftField,
} from './draft'
import { SourceIntake } from './source-intake'
import { TokenField } from './token-field'

const FIELD_ORDER: DraftField[] = ['chain', 'token', 'date', 'claimType', 'minUsd', 'sourceUrl']

const WINDOW_DAYS = [1, 2, 3, 4, 5, 6, 7] as const

function Cell({
  label,
  htmlFor,
  error,
  errorId,
  className = '',
  children,
}: {
  label: string
  htmlFor: string
  error?: string | undefined
  errorId: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={`relative flex min-w-0 flex-col gap-1 px-4 py-3 focus-within:shadow-[inset_0_0_0_2px_var(--time-blue)] md:px-5 ${className}`}
    >
      <label htmlFor={htmlFor} className="t-meta">
        {label}
      </label>
      {children}
      {error ? (
        <p id={errorId} className="t-ui mt-1 font-medium text-ink">
          <span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 bg-ink align-middle" />
          {error}
        </p>
      ) : null}
    </div>
  )
}

function SelectChevron() {
  return (
    <ChevronIcon
      size={16}
      className="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 rotate-90 text-meta"
    />
  )
}

const control = 'w-full appearance-none bg-transparent pr-6 text-[15px] text-ink outline-none'

/**
 * The claim as one instrument bar: chain, token, date, claim type, then Stamp. Options and the
 * source link sit behind two disclosures so the default path is four fields and one button.
 */
export function ClaimComposer({
  initial,
  lastSettled,
  busy,
  onStamp,
}: {
  initial: Draft
  lastSettled: string
  busy: boolean
  /** Resolves with field errors from the server, or null when the stamp was accepted. */
  onStamp: (input: ClaimInput) => Promise<DraftErrors | null>
}) {
  const base = useId()
  const ids = {
    chain: `${base}-chain`,
    token: `${base}-token`,
    date: `${base}-date`,
    claimType: `${base}-claim`,
    minUsd: `${base}-min`,
    window: `${base}-window`,
    sourceUrl: `${base}-source`,
    sourceText: `${base}-text`,
  }
  const [draft, setDraft] = useState<Draft>(initial)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [panel, setPanel] = useState<'source' | 'options' | null>(
    initial.sourceUrl || initial.sourceText ? 'source' : null,
  )

  function update(patch: Partial<Draft>, fields: DraftField[]) {
    setDraft((current) => {
      const next = { ...current, ...patch }
      if (patch.chain !== undefined && patch.chain !== current.chain && patch.token === undefined) {
        next.token = null
        next.tokenQuery = ''
      }
      return next
    })
    setErrors((current) => {
      const next = { ...current }
      for (const field of fields) delete next[field]
      return next
    })
  }

  function applyProposal(patch: Partial<Draft>) {
    const fields: DraftField[] = []
    if (patch.chain !== undefined) fields.push('chain', 'token')
    if (patch.token !== undefined || patch.tokenQuery !== undefined) fields.push('token')
    if (patch.date !== undefined) fields.push('date')
    if (patch.claimType !== undefined) fields.push('claimType')
    update(patch, fields)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const found = validateDraft(draft, lastSettled)
    const input = toClaimInput(draft)
    if (Object.keys(found).length > 0 || !input) {
      setErrors(found)
      if (found.minUsd) setPanel('options')
      else if (found.sourceUrl) setPanel('source')
      const first = FIELD_ORDER.find((field) => found[field])
      if (first) requestAnimationFrame(() => document.getElementById(ids[first])?.focus())
      return
    }
    setErrors({})
    const serverErrors = await onStamp(input)
    if (serverErrors) setErrors(serverErrors)
  }

  const errorId = (field: DraftField) => `${ids[field]}-error`
  const describe = (field: DraftField) => (errors[field] ? errorId(field) : undefined)
  const optionsSummary = `${draft.windowDays === 1 ? '1-day' : `${draft.windowDays}-day`} window, ${usdFull(Number(draft.minUsd) || 0)} minimum`

  return (
    <form onSubmit={submit} noValidate aria-label="Claim to check">
      <div className="rounded-lg border border-rule-strong bg-workspace">
        <div className="grid md:grid-cols-2 lg:flex lg:items-stretch">
          <Cell
            label="Chain"
            htmlFor={ids.chain}
            error={errors.chain}
            errorId={errorId('chain')}
            className="border-b border-rule md:border-r lg:w-[190px] lg:shrink-0 lg:border-b-0"
          >
            <div className="relative">
              <select
                id={ids.chain}
                className={control}
                value={draft.chain}
                aria-invalid={errors.chain ? true : undefined}
                aria-describedby={describe('chain')}
                onChange={(event) =>
                  update({ chain: event.target.value as Chain | '' }, ['chain', 'token'])
                }
              >
                <option value="">Choose</option>
                {CHAINS.map((chain) => {
                  const coverage = CHAIN_COVERAGE[chain]
                  return (
                    <option key={chain} value={chain}>
                      {CHAIN_DISPLAY[chain]}
                      {coverage.wallet_history || coverage.sm_snapshot ? '' : ' (no dated data)'}
                    </option>
                  )
                })}
              </select>
              <SelectChevron />
            </div>
          </Cell>

          <Cell
            label="Token"
            htmlFor={ids.token}
            error={errors.token}
            errorId={errorId('token')}
            className="border-b border-rule lg:flex-1 lg:border-b-0 lg:border-r"
          >
            <TokenField
              id={ids.token}
              chain={draft.chain}
              value={draft.token}
              query={draft.tokenQuery}
              error={errors.token}
              describedBy={describe('token')}
              onQueryChange={(tokenQuery) => update({ tokenQuery }, ['token'])}
              onSelect={(token) => update({ token }, ['token'])}
            />
          </Cell>

          <Cell
            label="Date (UTC)"
            htmlFor={ids.date}
            error={errors.date}
            errorId={errorId('date')}
            className="border-b border-rule md:border-r lg:w-[200px] lg:shrink-0 lg:border-b-0"
          >
            <input
              id={ids.date}
              type="date"
              max={lastSettled}
              className="w-full bg-transparent text-[15px] text-ink tabular-nums outline-none"
              value={draft.date}
              aria-invalid={errors.date ? true : undefined}
              aria-describedby={[describe('date'), `${ids.date}-hint`].filter(Boolean).join(' ')}
              onChange={(event) => update({ date: event.target.value }, ['date'])}
            />
          </Cell>

          <Cell
            label="Claim"
            htmlFor={ids.claimType}
            error={errors.claimType}
            errorId={errorId('claimType')}
            className="border-b border-rule lg:w-[250px] lg:shrink-0 lg:border-b-0 lg:border-r"
          >
            <div className="relative">
              <select
                id={ids.claimType}
                className={control}
                value={draft.claimType}
                aria-invalid={errors.claimType ? true : undefined}
                aria-describedby={describe('claimType')}
                onChange={(event) =>
                  update({ claimType: event.target.value as Draft['claimType'] }, ['claimType'])
                }
              >
                <option value="">Smart Money…</option>
                {COMPOSER_CLAIM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {CLAIM_TYPE_DISPLAY[type]}
                  </option>
                ))}
              </select>
              <SelectChevron />
            </div>
          </Cell>

          <div className="flex p-3 md:col-span-2 lg:p-2">
            <button
              type="submit"
              disabled={busy}
              className="t-ui inline-flex h-12 w-full items-center justify-center rounded-md bg-time px-6 text-[15px] font-medium text-white transition-colors duration-[var(--dur-fast)] hover:bg-time-deep disabled:bg-time-deep lg:h-full lg:min-h-11 lg:w-auto"
            >
              {busy ? 'Stamping…' : 'Stamp'}
            </button>
          </div>
        </div>

        {panel === 'source' ? (
          <SourceIntake
            draft={draft}
            errors={errors}
            lastSettled={lastSettled}
            onChange={(field, value) =>
              update(field === 'sourceUrl' ? { sourceUrl: value } : { sourceText: value }, [field])
            }
            onApply={applyProposal}
          />
        ) : null}

        {panel === 'options' ? (
          <div
            id={`${base}-options`}
            className="grid gap-5 border-t border-rule px-4 py-5 sm:grid-cols-2 md:px-5 lg:max-w-[760px]"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.window} className="t-meta">
                Window ending on the claim date
              </label>
              <div className="relative rounded-md border border-rule-strong bg-canvas px-3">
                <select
                  id={ids.window}
                  className={`${control} h-11`}
                  value={draft.windowDays}
                  onChange={(event) => update({ windowDays: Number(event.target.value) }, [])}
                >
                  {WINDOW_DAYS.map((days) => (
                    <option key={days} value={days}>
                      {days === 1 ? '1 day' : `${days} days`}
                    </option>
                  ))}
                </select>
                <ChevronIcon
                  size={16}
                  className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rotate-90 text-meta"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.minUsd} className="t-meta">
                Minimum in USD
              </label>
              <input
                id={ids.minUsd}
                type="text"
                inputMode="decimal"
                className="h-11 rounded-md border border-rule-strong bg-canvas px-3 text-[15px] text-ink tabular-nums"
                value={draft.minUsd}
                aria-invalid={errors.minUsd ? true : undefined}
                aria-describedby={[describe('minUsd'), `${ids.minUsd}-hint`]
                  .filter(Boolean)
                  .join(' ')}
                onChange={(event) =>
                  update({ minUsd: event.target.value.replace(/[^\d.]/g, '') }, ['minUsd'])
                }
              />
              {errors.minUsd ? (
                <p id={errorId('minUsd')} className="t-ui font-medium text-ink">
                  {errors.minUsd}
                </p>
              ) : null}
            </div>
            <p id={`${ids.minUsd}-hint`} className="t-ui text-ink-soft sm:col-span-2">
              The smallest Smart Money net flow or position that counts as support. The window
              always ends on the claim date, so nothing after the cutoff is read.
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <button
          type="button"
          aria-expanded={panel === 'source'}
          className="t-ui inline-flex h-11 items-center gap-1.5 text-ink-soft hover:text-ink"
          onClick={() => setPanel(panel === 'source' ? null : 'source')}
        >
          <ChevronIcon
            size={14}
            className={`transition-transform duration-[var(--dur-fast)] ${panel === 'source' ? 'rotate-90' : ''}`}
          />
          Start from a post or link
        </button>
        <button
          type="button"
          aria-expanded={panel === 'options'}
          aria-controls={panel === 'options' ? `${base}-options` : undefined}
          className="t-ui inline-flex h-11 items-center gap-1.5 text-ink-soft hover:text-ink"
          onClick={() => setPanel(panel === 'options' ? null : 'options')}
        >
          <ChevronIcon
            size={14}
            className={`transition-transform duration-[var(--dur-fast)] ${panel === 'options' ? 'rotate-90' : ''}`}
          />
          Options: <span className="tabular-nums">{optionsSummary}</span>
        </button>
        <p id={`${ids.date}-hint`} className="t-ui text-meta lg:ml-auto">
          Dates are UTC days. Latest settled day: {formatDay(lastSettled)}.
          {draft.date !== lastSettled ? (
            <>
              {' '}
              <button
                type="button"
                className="text-ink-soft underline decoration-rule-strong underline-offset-4 hover:text-ink"
                onClick={() => update({ date: lastSettled }, ['date'])}
              >
                Use it
              </button>
            </>
          ) : null}
        </p>
      </div>
    </form>
  )
}
