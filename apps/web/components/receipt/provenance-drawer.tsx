'use client'

import { CLAIM_TYPE_DISPLAY, type PublicReceipt, type SourceClass } from '@then/core'
import Link from 'next/link'
import { useId, useRef } from 'react'
import { CloseIcon } from '@/components/icons'
import { chainName, formatDay, formatStamp, usdFull } from '@/lib/format'

const SOURCE_TEXT: Record<SourceClass, { title: string; body: string }> = {
  historical_cohort: {
    title: 'Historical cohort',
    body: "Point-in-time Smart Money: historical DEX trades carrying the labels each wallet had when it traded, and Nansen's daily Smart Money holdings snapshots.",
  },
  dated_activity: {
    title: 'Dated activity',
    body: 'Daily price and volume for the window. One reference price values both sides, so price cannot create a difference.',
  },
  current_label_replay: {
    title: 'Current-label replay',
    body: "The same dated window read through today's Smart Money labels, the way most dashboards show history.",
  },
}

const INPUT_TEXT: [keyof PublicReceipt['decision_inputs'], string][] = [
  ['ablation', 'Point-in-time data switched off'],
  ['date_settled', 'Claim date has settled'],
  ['surface_available', 'A point-in-time surface exists'],
  ['asof_floor_met', 'Point-in-time evidence floor met'],
  ['asof_conflict', 'Point-in-time sources conflict'],
  ['asof_support', 'As-of support'],
  ['live_floor_met', 'Current-label evidence floor met'],
  ['live_support', "Today's-label support"],
  ['label_drift_attributed', 'Difference attributed to label changes'],
]

function show(value: boolean | string | null): string {
  if (value === null) return 'not applicable'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return value
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-rule py-5 first:border-t-0 first:pt-0">
      <h3 className="t-ui font-medium text-ink">{title}</h3>
      <div className="t-ui mt-2 space-y-3 text-ink-soft">{children}</div>
    </section>
  )
}

type Row = [string, React.ReactNode]

function fieldRows(...entries: (Row | false | null | undefined | '')[]): Row[] {
  return entries.filter((entry): entry is Row => Boolean(entry))
}

function Fields({ rows }: { rows: Row[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2">
      {rows.map(([term, detail]) => (
        <div key={term} className="contents">
          <dt className="t-meta pt-0.5">{term}</dt>
          <dd className="min-w-0 text-ink">{detail}</dd>
        </div>
      ))}
    </dl>
  )
}

function Hash({ value }: { value: string }) {
  return <span className="font-mono text-[12px] break-all text-ink">{value}</span>
}

/** "Why this stamp exists": how the claim was read, what each source is, and what the hashes commit to. */
export function ProvenanceDrawer({
  receipt,
  onOpen,
}: {
  receipt: PublicReceipt
  onOpen?: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const { claim, evidence, commitments } = receipt

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        className="t-ui inline-flex h-11 items-center rounded-md bg-ink px-4 font-medium text-white transition-colors duration-[var(--dur-fast)] hover:bg-ink-soft"
        onClick={() => {
          dialog.current?.showModal()
          onOpen?.()
        }}
      >
        Why this stamp exists
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="m-0 ml-auto h-dvh max-h-none w-full max-w-[600px] border-0 border-l border-rule-strong bg-canvas p-0 text-ink backdrop:bg-[rgb(18_18_16/0.28)] open:animate-[drawer-in_var(--dur-ui)_var(--ease-standard)]"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close()
        }}
      >
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-rule px-5 py-4 md:px-7">
            <h2 id={titleId} className="t-h3">
              Why this stamp exists
            </h2>
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-band"
              onClick={() => dialog.current?.close()}
            >
              <CloseIcon />
              <span className="sr-only">Close</span>
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-6 md:px-7">
            <Section title="Claim, as evaluated">
              <p>EVM contract addresses are lowercased. Solana addresses keep their case.</p>
              <Fields
                rows={fieldRows(
                  ['Chain', chainName(claim.chain)],
                  ['Token contract', <Hash key="token" value={claim.token_address} />],
                  claim.token_symbol && ['Symbol', `$${claim.token_symbol}`],
                  ['Claim', `${CLAIM_TYPE_DISPLAY[claim.claim_type]} (${claim.claim_type})`],
                  ['Smart Money labels', claim.sm_label_set.join(', ')],
                  ['Minimum', usdFull(claim.min_usd)],
                  claim.source_url && [
                    'Source',
                    <a
                      key="src"
                      href={claim.source_url}
                      rel="noreferrer nofollow"
                      className="break-all underline decoration-rule-strong underline-offset-4"
                    >
                      {claim.source_url}
                    </a>,
                  ],
                  claim.source_text_sha256 && [
                    'Source text',
                    <Hash key="text" value={claim.source_text_sha256} />,
                  ],
                  ['Claim hash', <Hash key="claim" value={receipt.claim_hash} />],
                )}
              />
            </Section>

            <Section title="Historical cutoff">
              <p>
                End of {formatDay(evidence.historical_cutoff)}, UTC. The window runs from{' '}
                {formatDay(evidence.window.from)} to {formatDay(evidence.window.to)}. Every
                point-in-time request stops at the cutoff, and nothing dated after it decides the
                verdict.
              </p>
            </Section>

            <Section title="Nansen source classes">
              <ul className="space-y-3">
                {evidence.sources.map((source) => (
                  <li key={source.class}>
                    <p className="text-ink">
                      {SOURCE_TEXT[source.class].title}{' '}
                      <span className="t-meta">· {source.status.replace('_', ' ')}</span>
                    </p>
                    <p>{SOURCE_TEXT[source.class].body}</p>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Comparison method">
              <p>
                Support threshold: {usdFull(evidence.threshold.usd)} ({evidence.threshold.rule}). A
                side supports the claim when its Smart Money net flow or position clears the
                threshold in the claimed direction.
              </p>
              <p>
                VALID when the cohort recognized on the claim date supports the claim. CONTAMINATED
                when only today&apos;s labels support it and wallets labeled after the date account
                for the difference. INSUFFICIENT for everything else.{' '}
                <Link
                  href="/method"
                  className="text-ink underline decoration-rule-strong underline-offset-4"
                >
                  Read the method
                </Link>
              </p>
              <Fields
                rows={INPUT_TEXT.map(([key, label]): Row => [
                  label,
                  show(receipt.decision_inputs[key]),
                ])}
              />
            </Section>

            <Section title="Evidence completeness">
              <p>
                {commitments.payload_count} Nansen responses were stored and are committed to by
                hash.{' '}
                {evidence.settlement === 'recent'
                  ? 'The claim date is recent, so Nansen may still revise this window.'
                  : evidence.settlement === 'settled'
                    ? 'The claim date is a settled day.'
                    : 'The claim date had not settled when this was stamped.'}
              </p>
            </Section>

            <Section title="Receipt">
              <Fields
                rows={fieldRows(
                  ['Receipt id', <Hash key="id" value={receipt.receipt_id} />],
                  ['Generated', `${formatStamp(receipt.generated_at)} (${receipt.generated_at})`],
                  ['Method', receipt.method_version],
                  ['Engine', receipt.engine_version],
                  ['Receipt format', receipt.receipt_version],
                  receipt.signature && [
                    'Public hash',
                    <Hash key="ph" value={receipt.signature.public_hash} />,
                  ],
                  ['Payload root', <Hash key="root" value={commitments.payload_root} />],
                  [
                    'Private commitment',
                    <Hash key="internal" value={commitments.internal_commitment} />,
                  ],
                )}
              />
            </Section>

            <Section title="Restatement">
              <p>{receipt.restatement_notice}</p>
            </Section>

            <Section title="What stays private">
              <p>
                This receipt carries support states, rule parameters, timestamps, and hashes. Wallet
                addresses, wallet counts, and Smart Money amounts stay in the private evidence
                bundle. The private commitment above is the hash of that bundle, so it cannot change
                without breaking this receipt.
              </p>
            </Section>

            <details className="group border-t border-rule pt-5">
              <summary className="t-ui cursor-pointer font-medium text-ink">
                Developer detail
              </summary>
              <div className="t-ui mt-3 space-y-3 text-ink-soft">
                <Fields
                  rows={fieldRows(
                    ['Origin', receipt.origin],
                    receipt.restamp_of && ['Restamp of', receipt.restamp_of],
                    receipt.signature && ['Signing key', receipt.signature.key_id],
                    receipt.signature && [
                      'Signature',
                      <Hash key="sig" value={receipt.signature.value} />,
                    ],
                  )}
                />
                <p className="t-meta">Source hashes</p>
                <ul className="space-y-1">
                  {commitments.source_hashes.map((hash) => (
                    <li key={hash}>
                      <Hash value={hash} />
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </div>
        </div>
      </dialog>
    </>
  )
}
