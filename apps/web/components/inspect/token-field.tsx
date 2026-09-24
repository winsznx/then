'use client'

import { CHAIN_DISPLAY, normalizeTokenAddress, shortAddress, type Chain } from '@then/core'
import { useEffect, useId, useRef, useState } from 'react'
import { api } from '@/lib/client/api'

export interface TokenChoice {
  address: string
  symbol: string | null
  name: string | null
}

interface SearchHit {
  name: string
  symbol: string
  address: string
  rank: number | null
}

type SearchState =
  { key: string; ok: true; hits: SearchHit[] } | { key: string; ok: false; message: string }

type Option = { kind: 'hit'; hit: SearchHit } | { kind: 'address'; address: string }

/**
 * Token search as a combobox. Several matches are listed for the user to choose from; nothing is
 * picked on their behalf. A pasted contract address is always accepted as-is.
 */
export function TokenField({
  id,
  chain,
  value,
  query,
  onQueryChange,
  onSelect,
  error,
  describedBy,
}: {
  id: string
  chain: Chain | ''
  value: TokenChoice | null
  query: string
  onQueryChange: (query: string) => void
  onSelect: (token: TokenChoice | null) => void
  error?: string | undefined
  describedBy?: string | undefined
}) {
  const listId = useId()
  const hintId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const [search, setSearch] = useState<SearchState | null>(null)

  const trimmed = query.trim()
  const address = chain ? normalizeTokenAddress(chain, trimmed) : null
  const searchKey =
    chain && !value && !address && trimmed.length >= 2 ? `${chain}:${trimmed}` : null

  useEffect(() => {
    if (!searchKey || !chain) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      api<{ tokens: SearchHit[] }>(
        `/api/tokens/search?chain=${chain}&q=${encodeURIComponent(trimmed)}`,
        {
          signal: controller.signal,
        },
      )
        .then((result) =>
          setSearch(
            result.ok
              ? { key: searchKey, ok: true, hits: result.data.tokens }
              : { key: searchKey, ok: false, message: result.message },
          ),
        )
        .catch((reason: unknown) => {
          if (!controller.signal.aborted)
            setSearch({ key: searchKey, ok: false, message: String(reason) })
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [searchKey, chain, trimmed])

  const current = search && search.key === searchKey ? search : null
  const options: Option[] = address
    ? [{ kind: 'address', address }]
    : current?.ok
      ? current.hits.map((hit) => ({ kind: 'hit', hit }))
      : []
  const activeIndex = Math.min(active, options.length - 1)
  const open = focused && !value && (address !== null || searchKey !== null)

  function choose(option: Option) {
    onSelect(
      option.kind === 'address'
        ? { address: option.address, symbol: null, name: null }
        : { address: option.hit.address, symbol: option.hit.symbol, name: option.hit.name },
    )
  }

  if (value) {
    return (
      <div className="flex min-w-0 items-center justify-between gap-3">
        <output id={id} className="flex min-w-0 items-baseline gap-2 text-[15px] text-ink">
          <span className="font-medium">{value.symbol ? `$${value.symbol}` : 'Contract'}</span>
          <span className="t-meta truncate" title={value.address}>
            {value.name ? `${value.name} · ` : ''}
            {shortAddress(value.address)}
          </span>
        </output>
        <button
          type="button"
          className="t-ui shrink-0 text-ink-soft underline decoration-rule-strong underline-offset-4 hover:text-ink"
          onClick={() => {
            onSelect(null)
            requestAnimationFrame(() => inputRef.current?.focus())
          }}
        >
          Change
        </button>
      </div>
    )
  }

  const status = !chain
    ? 'Pick a chain first, then search by symbol, name, or contract address.'
    : address
      ? null
      : searchKey && !current
        ? 'Searching Nansen…'
        : current && !current.ok
          ? `${current.message} Paste the contract address instead.`
          : current?.ok && current.hits.length === 0
            ? `No ${CHAIN_DISPLAY[chain]} token matches “${trimmed}”. Paste the contract address instead.`
            : null

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && options.length > 0 ? `${listId}-${activeIndex}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [describedBy, status ? hintId : null].filter(Boolean).join(' ') || undefined
        }
        placeholder={chain ? 'Symbol, name, or contract' : 'Pick a chain first'}
        className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-meta"
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value)
          setActive(0)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (!open) return
          if (event.key === 'ArrowDown' && options.length > 0) {
            event.preventDefault()
            setActive((activeIndex + 1) % options.length)
          } else if (event.key === 'ArrowUp' && options.length > 0) {
            event.preventDefault()
            setActive((activeIndex - 1 + options.length) % options.length)
          } else if (event.key === 'Enter' && options[activeIndex]) {
            event.preventDefault()
            choose(options[activeIndex])
          } else if (event.key === 'Escape') {
            setFocused(false)
          }
        }}
      />
      {open ? (
        <div className="absolute top-[calc(100%+14px)] right-[-16px] left-[-16px] z-[var(--z-overlay)] overflow-hidden rounded-md border border-rule-strong bg-workspace shadow-[var(--shadow-float)]">
          <ul
            id={listId}
            role="listbox"
            aria-label="Matching tokens"
            className={options.length > 0 ? 'max-h-72 overflow-y-auto py-1' : 'hidden'}
          >
            {options.map((option, index) => (
              <li
                key={option.kind === 'address' ? option.address : option.hit.address}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`flex cursor-pointer items-baseline justify-between gap-4 px-4 py-2.5 ${index === activeIndex ? 'bg-band' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
              >
                {option.kind === 'address' ? (
                  <>
                    <span className="t-ui text-ink">Use this contract address</span>
                    <span className="t-meta">{shortAddress(option.address)}</span>
                  </>
                ) : (
                  <>
                    <span className="t-ui min-w-0 truncate text-ink">
                      <span className="font-medium">${option.hit.symbol}</span>
                      <span className="text-ink-soft"> {option.hit.name}</span>
                    </span>
                    <span className="t-meta shrink-0">{shortAddress(option.hit.address)}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
          {status ? (
            <p
              id={hintId}
              className="t-ui border-t border-rule px-4 py-3 text-ink-soft first:border-t-0"
              role="status"
            >
              {status}
            </p>
          ) : null}
        </div>
      ) : status && !chain ? (
        <p id={hintId} className="sr-only">
          {status}
        </p>
      ) : null}
    </div>
  )
}
