'use client'

import type { PublicReceipt } from '@then/core'
import { useId, useState } from 'react'
import { api } from '@/lib/client/api'
import { track } from '@/lib/client/track'

type Prepared =
  | {
      mode: 'paper'
      intent_id: string
      intent_hash: string
      amount_usdc: number
      wallet_address: string
    }
  | {
      ok: true
      mode: 'live'
      transaction: string | null
      swap_tx: Record<string, unknown> | null
      needs_approval: boolean
      simulation_passed: boolean | null
      prepare_hash: string
    }

function refusal(receipt: PublicReceipt): string | null {
  if (receipt.origin === 'fixture') return 'Fixture receipts never prepare trades.'
  if (receipt.verdict !== 'VALID')
    return `Trade preparation is refused for ${receipt.verdict} claims. Only a VALID stamp can prepare a buy.`
  if (receipt.claim.claim_type === 'SM_SOLD') return 'A sell claim does not prepare a buy.'
  if (receipt.claim.chain !== 'solana' && receipt.claim.chain !== 'base')
    return 'Nansen Trading supports Solana and Base only, so this VALID claim cannot prepare a buy here.'
  return null
}

/**
 * The decision gate made visible. A VALID stamp on a supported chain can prepare a USDC buy; the
 * server re-checks the verdict and the receipt signature before anything is prepared. THEN never
 * holds a key and never broadcasts.
 */
export function TradePanel({ receipt, mode }: { receipt: PublicReceipt; mode: 'paper' | 'live' }) {
  const walletId = useId()
  const amountId = useId()
  const [wallet, setWallet] = useState('')
  const [amount, setAmount] = useState('25')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<
    { ok: true; prepared: Prepared } | { ok: false; message: string } | null
  >(null)
  const refused = refusal(receipt)

  if (refused) {
    return <p className="t-ui px-5 py-4 text-ink-soft md:px-8">{refused}</p>
  }

  const token = receipt.claim.token_symbol ? `$${receipt.claim.token_symbol}` : 'this token'

  async function prepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    track('trade_prepare_attempted', { verdict: receipt.verdict, chain: receipt.claim.chain, mode })
    setPending(true)
    const response = await api<Prepared>('/api/trade/prepare', {
      method: 'POST',
      json: {
        receipt_id: receipt.receipt_id,
        wallet_address: wallet.trim(),
        amount_usdc: Number(amount),
      },
    })
    setPending(false)
    setResult(
      response.ok
        ? { ok: true, prepared: response.data }
        : { ok: false, message: response.message },
    )
  }

  return (
    <section aria-label="Prepare a buy" className="px-5 py-5 md:px-8">
      <h3 className="t-ui font-medium text-ink">Prepare a buy of {token}</h3>
      <p className="t-ui mt-1 max-w-[70ch] text-ink-soft">
        {mode === 'paper'
          ? 'This deployment runs in paper mode: it records a hashed intent linked to this receipt and sends nothing anywhere.'
          : 'Nansen prepares an unsigned swap from USDC. You sign and send it from your own wallet. THEN holds no keys and broadcasts nothing.'}{' '}
        VALID means the dated cohort supported the claim, not that the trade is good.
      </p>
      <form
        onSubmit={prepare}
        className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={walletId} className="t-meta">
            Your {receipt.claim.chain === 'solana' ? 'Solana' : 'Base'} wallet address
          </label>
          <input
            id={walletId}
            required
            spellCheck={false}
            autoComplete="off"
            className="h-11 rounded-md border border-rule-strong bg-canvas px-3 font-mono text-[13px] text-ink"
            value={wallet}
            onChange={(event) => setWallet(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={amountId} className="t-meta">
            USDC (5 to 1,000)
          </label>
          <input
            id={amountId}
            required
            inputMode="decimal"
            className="h-11 rounded-md border border-rule-strong bg-canvas px-3 text-[15px] text-ink tabular-nums"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="t-ui inline-flex h-11 items-center justify-center rounded-md border border-ink px-4 font-medium text-ink hover:bg-band disabled:text-meta"
        >
          {pending ? 'Preparing…' : mode === 'paper' ? 'Record intent' : 'Prepare buy'}
        </button>
      </form>
      <div aria-live="polite">
        {result && !result.ok ? (
          <p className="t-ui mt-3 font-medium text-ink">{result.message}</p>
        ) : null}
        {result?.ok && result.prepared.mode === 'paper' ? (
          <p className="t-ui mt-3 text-ink-soft">
            Intent {result.prepared.intent_id} recorded. Nothing was sent. Intent hash{' '}
            <span className="font-mono text-[12px] break-all text-ink">
              {result.prepared.intent_hash}
            </span>
          </p>
        ) : null}
        {result?.ok && result.prepared.mode === 'live' ? (
          <div className="t-ui mt-3 space-y-2 text-ink-soft">
            <p>
              Unsigned transaction prepared.{' '}
              {result.prepared.simulation_passed === null
                ? 'Nansen did not report a simulation.'
                : result.prepared.simulation_passed
                  ? 'Simulation passed.'
                  : 'Simulation did not pass: do not sign this.'}
              {result.prepared.needs_approval ? ' Your wallet must approve USDC first.' : ''}
            </p>
            <p>
              Prepare hash{' '}
              <span className="font-mono text-[12px] break-all text-ink">
                {result.prepared.prepare_hash}
              </span>
            </p>
            <label className="t-meta block" htmlFor={`${walletId}-tx`}>
              Transaction to sign in your wallet
            </label>
            <textarea
              id={`${walletId}-tx`}
              readOnly
              rows={4}
              className="w-full rounded-md border border-rule-strong bg-canvas p-3 font-mono text-[12px] text-ink"
              value={
                result.prepared.transaction ?? JSON.stringify(result.prepared.swap_tx, null, 2)
              }
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}
