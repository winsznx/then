'use client'

import type { PublicReceipt } from '@then/core'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api } from '@/lib/client/api'

/**
 * Stamps the same claim again against Nansen today. The result is a new receipt with a drift
 * report beside it; this receipt never changes.
 */
export function RestampAction({ receiptId }: { receiptId: string }) {
  const router = useRouter()
  const [state, setState] = useState<
    { kind: 'idle' } | { kind: 'running' } | { kind: 'error'; message: string }
  >({
    kind: 'idle',
  })

  async function restamp() {
    setState({ kind: 'running' })
    const result = await api<{ receipt: PublicReceipt }>(`/api/restamp/${receiptId}`, {
      method: 'POST',
    })
    if (!result.ok) {
      setState({ kind: 'error', message: result.message })
      return
    }
    router.push(`/r/${result.data.receipt.receipt_id}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={restamp}
        disabled={state.kind === 'running'}
        className="t-ui inline-flex h-11 items-center rounded-md border border-ink px-4 font-medium text-ink transition-colors duration-[var(--dur-fast)] hover:bg-band disabled:text-meta"
      >
        {state.kind === 'running' ? 'Restamping…' : 'Restamp with today’s data'}
      </button>
      <p className="t-ui text-ink-soft" aria-live="polite">
        {state.kind === 'running'
          ? 'Reading Nansen again for the same claim. This takes up to a minute.'
          : state.kind === 'error'
            ? state.message
            : 'Costs Nansen credits. The result is a new receipt; this one stays as it is.'}
      </p>
    </div>
  )
}
