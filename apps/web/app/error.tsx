'use client'

import { useEffect } from 'react'

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('page failed to render', error.digest ?? error.message)
  }, [error])

  return (
    <div className="page py-24 md:py-36">
      <p className="t-meta">Error{error.digest ? ` ${error.digest}` : ''}</p>
      <h1 className="t-h2 mt-4 max-w-[20ch]">This page could not be loaded.</h1>
      <p className="t-lead mt-5 max-w-[52ch]">
        No stamp was changed. Stored receipts are immutable, so loading the page again is safe.
      </p>
      <button
        type="button"
        onClick={reset}
        className="t-ui mt-8 inline-flex h-11 items-center rounded-md bg-ink px-4 font-medium text-white transition-colors duration-[var(--dur-fast)] hover:bg-ink-soft"
      >
        Load again
      </button>
    </div>
  )
}
