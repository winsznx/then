'use client'

import {
  CHAIN_DISPLAY,
  CLAIM_TYPE_DISPLAY,
  type Chain,
  type ClaimType,
  type Verdict,
} from '@then/core'
import Link from 'next/link'
import { useEffect, useId, useState } from 'react'
import { ChevronIcon } from '@/components/icons'
import { VerdictWord } from '@/components/verdict/verdict'
import { track } from '@/lib/client/track'
import { formatDay } from '@/lib/format'

export interface ArchiveRowView {
  challenge_id: string
  as_of_date: string
  chain: string
  claim_type: string
  token_symbol: string | null
  daily_number: number | null
  played: { correct: boolean; verdict: Verdict } | null
}

type PlayedFilter = 'all' | 'unplayed' | 'played'

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: [string, string][]
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="t-meta">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="t-ui h-11 w-full appearance-none rounded-md border border-rule-strong bg-canvas pr-9 pl-3 text-ink"
        >
          {options.map(([optionValue, text]) => (
            <option key={optionValue} value={optionValue}>
              {text}
            </option>
          ))}
        </select>
        <ChevronIcon
          size={16}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rotate-90 text-meta"
        />
      </div>
    </div>
  )
}

/**
 * The case library. A row shows its verdict only after this player has committed an answer on
 * it; before that the list carries no answer at all.
 */
export function ArchiveList({ rows }: { rows: ArchiveRowView[] }) {
  const [chain, setChain] = useState('all')
  const [claimType, setClaimType] = useState('all')
  const [played, setPlayed] = useState<PlayedFilter>('all')

  useEffect(() => {
    track('archive_opened')
  }, [])

  const chains = [...new Set(rows.map((row) => row.chain))].sort()
  const types = [...new Set(rows.map((row) => row.claim_type))].sort()
  const visible = rows.filter(
    (row) =>
      (chain === 'all' || row.chain === chain) &&
      (claimType === 'all' || row.claim_type === claimType) &&
      (played === 'all' || (played === 'played') === (row.played !== null)),
  )

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3 lg:max-w-[760px]">
        <Select
          label="Chain"
          value={chain}
          onChange={setChain}
          options={[
            ['all', 'All chains'],
            ...chains.map((value): [string, string] => [
              value,
              CHAIN_DISPLAY[value as Chain] ?? value,
            ]),
          ]}
        />
        <Select
          label="Claim"
          value={claimType}
          onChange={setClaimType}
          options={[
            ['all', 'All claims'],
            ...types.map((value): [string, string] => [
              value,
              CLAIM_TYPE_DISPLAY[value as ClaimType] ?? value,
            ]),
          ]}
        />
        <Select
          label="Status"
          value={played}
          onChange={(value) => setPlayed(value as PlayedFilter)}
          options={[
            ['all', 'All cases'],
            ['unplayed', 'Not played'],
            ['played', 'Played'],
          ]}
        />
      </div>

      <p className="t-meta mt-8" aria-live="polite">
        {visible.length} of {rows.length} case{rows.length === 1 ? '' : 's'}
      </p>
      <ul className="mt-3 border-t border-rule">
        {visible.map((row) => (
          <li key={row.challenge_id}>
            <Link
              href={`/challenge/archive/${row.challenge_id}`}
              className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 border-b border-rule px-1 py-4 transition-colors duration-[var(--dur-fast)] hover:bg-workspace md:grid-cols-[9rem_8rem_minmax(0,1fr)_12rem_1.5rem]"
            >
              <span className="t-meta text-ink">{formatDay(row.as_of_date)}</span>
              <span className="t-ui text-ink-soft max-md:hidden">
                {CHAIN_DISPLAY[row.chain as Chain] ?? row.chain}
              </span>
              <span className="t-ui min-w-0 truncate text-ink max-md:col-span-2 max-md:row-start-2">
                {row.token_symbol ? `$${row.token_symbol}` : 'Token'} ·{' '}
                {CLAIM_TYPE_DISPLAY[row.claim_type as ClaimType] ?? row.claim_type}
                {row.daily_number ? (
                  <span className="t-meta">
                    {' '}
                    · Daily {String(row.daily_number).padStart(3, '0')}
                  </span>
                ) : null}
              </span>
              <span className="t-ui text-right md:text-left">
                {row.played ? (
                  <>
                    <span className="t-meta mr-2">{row.played.correct ? 'Correct' : 'Missed'}</span>
                    <VerdictWord verdict={row.played.verdict} className="text-[13px]" />
                  </>
                ) : (
                  <span className="t-meta">Not played</span>
                )}
              </span>
              <ChevronIcon
                size={16}
                className="text-meta transition-transform duration-[var(--dur-fast)] group-hover:translate-x-0.5 max-md:hidden"
              />
            </Link>
          </li>
        ))}
      </ul>
      {visible.length === 0 ? (
        <p className="t-ui mt-6 text-ink-soft">
          No case matches these filters. Clear a filter to see more.
        </p>
      ) : null}
    </div>
  )
}
