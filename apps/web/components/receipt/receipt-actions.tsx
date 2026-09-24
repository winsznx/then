'use client'

import { claimSentence, type PublicReceipt } from '@then/core'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { CheckIcon, CopyIcon, DownloadIcon } from '@/components/icons'
import { track } from '@/lib/client/track'
import { ProvenanceDrawer } from './provenance-drawer'
import { VerifyPanel, verifyInBrowser, type VerifyState } from './verify-panel'

const button =
  't-ui inline-flex h-11 items-center gap-2 rounded-md border border-rule-strong px-3.5 text-ink transition-colors duration-[var(--dur-fast)] hover:bg-band disabled:text-meta'

/**
 * Everything a finished stamp offers: provenance, the permanent receipt page, sharing, the public
 * JSON, and an integrity check that runs in this browser.
 */
export function ReceiptActions({
  receipt,
  surface,
}: {
  receipt: PublicReceipt
  surface: 'inspect' | 'receipt'
}) {
  const [copied, setCopied] = useState(false)
  const [verify, setVerify] = useState<VerifyState>({ kind: 'idle' })
  const copiedTimer = useRef<number | undefined>(undefined)
  const path = `/r/${receipt.receipt_id}`
  const props = { verdict: receipt.verdict, chain: receipt.claim.chain, surface }

  function receiptUrl(): string {
    return new URL(path, window.location.origin).toString()
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(receiptUrl())
      setCopied(true)
      window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.warn('clipboard unavailable', error)
      window.prompt('Copy this receipt link', receiptUrl())
    }
  }

  async function share() {
    track('receipt_shared', props)
    const data = {
      title: `THEN · ${receipt.verdict}`,
      text: `${claimSentence(receipt.claim)}: ${receipt.verdict}`,
      url: receiptUrl(),
    }
    if (typeof navigator.share === 'function' && navigator.canShare?.(data) !== false) {
      try {
        await navigator.share(data)
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.warn('share sheet failed, copying instead', error)
      }
    }
    await copyLink()
  }

  async function runVerify() {
    track('public_verify_run', props)
    setVerify({ kind: 'running' })
    try {
      setVerify(await verifyInBrowser(receipt.receipt_id))
    } catch (error) {
      setVerify({
        kind: 'error',
        message:
          error instanceof Error
            ? `Verification could not run: ${error.message}`
            : 'Verification could not run.',
      })
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 py-4 md:px-8">
        <ProvenanceDrawer receipt={receipt} onOpen={() => track('provenance_opened', props)} />
        {surface === 'inspect' ? (
          <Link href={path} className={button} onClick={() => track('receipt_opened', props)}>
            Open receipt
          </Link>
        ) : null}
        <button type="button" className={button} onClick={copyLink}>
          {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        <button type="button" className={button} onClick={share}>
          Share
        </button>
        <a
          href={`/api/receipt/${receipt.receipt_id}?download=1`}
          download={`${receipt.receipt_id}.public.json`}
          className={button}
          onClick={() => track('receipt_downloaded', props)}
        >
          <DownloadIcon size={16} />
          Public receipt
        </a>
        <button
          type="button"
          className={button}
          onClick={runVerify}
          disabled={verify.kind === 'running'}
        >
          Verify integrity
        </button>
        <span className="sr-only" aria-live="polite">
          {copied ? 'Receipt link copied.' : ''}
        </span>
      </div>
      <VerifyPanel state={verify} receiptId={receipt.receipt_id} />
    </div>
  )
}
