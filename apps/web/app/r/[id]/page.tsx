import { VERDICT_HEADLINES, claimSentence, type PublicReceipt } from '@then/core'
import type { DriftReport, VerifyReport } from '@then/receipt'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TemporalComparator } from '@/components/inspect/temporal-comparator'
import { ReceiptActions } from '@/components/receipt/receipt-actions'
import { RestampAction } from '@/components/receipt/restamp-action'
import { WalletTable } from '@/components/receipt/wallet-table'
import { VERDICT_STYLE, VerdictWord } from '@/components/verdict/verdict'
import { chainName, formatDay, formatStamp, usdFull } from '@/lib/format'
import { loadReceiptView, walletDetail, type RestampEntry } from '@/lib/server/receipts'
import { ClaimSentence } from '@/components/verdict/claim-sentence'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const view = await loadReceiptView((await params).id)
  if (!view) return { title: 'Receipt not found' }
  const { receipt } = view
  const title = `${receipt.verdict}: ${claimSentence(receipt.claim)}`
  return {
    title,
    description: receipt.comparison.public_explanation,
    alternates: { canonical: `/r/${receipt.receipt_id}` },
    openGraph: { type: 'article', title, description: receipt.comparison.public_explanation },
  }
}

const ORIGIN_TEXT: Record<PublicReceipt['origin'], string> = {
  live_stamp: 'stamped',
  restamp: 'restamped',
  fixture: 'synthetic fixture made',
}

const SIGNER_TEXT: Record<NonNullable<VerifyReport['signer']>['role'], string> = {
  hosted: "this deployment's hosted key",
  local: "the operator's command-line key",
  fixture: 'the public fixture key (synthetic receipts only)',
}

function driftSentences(drift: DriftReport): string[] {
  const changedSources = drift.sources.filter((source) => source.changed).length
  return [
    drift.verdict.changed
      ? `Verdict changed from ${drift.verdict.original} to ${drift.verdict.restamp}.`
      : `Verdict unchanged: ${drift.verdict.restamp}.`,
    drift.method.changed
      ? `The method also changed, from ${drift.method.original} to ${drift.method.restamp}, so a difference can come from the revised rule rather than from Nansen's data.`
      : `Same method (${drift.method.restamp}).`,
    changedSources === 0
      ? 'Every source returned the same data.'
      : `${changedSources} of ${drift.sources.length} sources returned different data.`,
  ]
}

function DocketRow({
  title,
  id,
  children,
}: {
  title: string
  id?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="grid gap-3 border-t border-rule py-8 md:grid-cols-12 md:gap-6">
      <h2 className="t-ui font-medium text-ink md:col-span-3">{title}</h2>
      <div className="t-ui space-y-3 text-ink-soft md:col-span-9">{children}</div>
    </section>
  )
}

function Hash({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <dt className="t-meta">{label}</dt>
      <dd className="font-mono text-[12px] break-all text-ink">{value}</dd>
    </div>
  )
}

function RestampList({ restamps }: { restamps: RestampEntry[] }) {
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {restamps.map((entry) => (
        <li key={entry.receipt_id} className="py-3">
          <p className="text-ink">
            <Link
              href={`/r/${entry.receipt_id}`}
              className="underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
            >
              {entry.receipt_id}
            </Link>{' '}
            <span className="t-meta">restamped {formatStamp(entry.created_at)}</span>
          </p>
          <p>{driftSentences(entry.drift).join(' ')}</p>
        </li>
      ))}
    </ul>
  )
}

export default async function ReceiptPage({ params }: Props) {
  const view = await loadReceiptView((await params).id)
  if (!view) notFound()
  const { receipt, report, restamps, driftFromOriginal } = view
  const wallets = await walletDetail(receipt.receipt_id)
  const fixture = receipt.origin === 'fixture' || report.signer?.role === 'fixture'
  const failed = report.checks.filter((check) => !check.ok)
  const style = VERDICT_STYLE[receipt.verdict]

  return (
    <article>
      <div className="border-b border-rule bg-band">
        <p className="page t-meta flex flex-wrap gap-x-3 gap-y-1 py-3 !text-ink-soft">
          <span className="font-medium text-ink">
            {fixture ? 'FIXTURE · SYNTHETIC DATA' : 'REPLAY'}
          </span>
          <span>Stored receipt, not a live result</span>
          <span>
            {ORIGIN_TEXT[receipt.origin]} made {formatStamp(receipt.generated_at)}
          </span>
          <span>method {receipt.method_version}</span>
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-nansen" />
            Powered by Nansen API
          </span>
        </p>
      </div>

      <div className="page pt-10 pb-24 md:pt-14 md:pb-32">
        {!report.ok ? (
          <div role="alert" className="mb-10 rounded-lg border border-ink px-5 py-5 md:px-8">
            <p className="t-ui font-medium text-ink">
              This receipt did not verify on this deployment. {failed.length} of{' '}
              {report.checks.length} checks failed. Do not rely on it.
            </p>
            <p className="t-ui mt-1 text-ink-soft">
              Failed: {failed.map((check) => check.name.replaceAll('_', ' ')).join(', ')}.{' '}
              <Link
                href="/method#receipts"
                className="text-ink underline decoration-rule-strong underline-offset-4"
              >
                How verification works
              </Link>
            </p>
          </div>
        ) : null}

        <header className="grid gap-10 md:grid-cols-12 md:gap-6">
          <div className="md:col-span-8">
            <p className="t-meta">Receipt {receipt.receipt_id}</p>
            <p className="mt-5 text-[40px] leading-[0.9] sm:text-[56px] md:text-[88px] xl:text-[112px]">
              <VerdictWord verdict={receipt.verdict} />
            </p>
            <div className={`mt-5 h-px w-full max-w-[320px] ${style.rule}`} aria-hidden="true" />
            <h1 className="t-h2 mt-6 max-w-[20ch]">
              <ClaimSentence claim={receipt.claim} />
            </h1>
            <p className="t-lead mt-5 max-w-[56ch]">{VERDICT_HEADLINES[receipt.verdict]}</p>
            <p className="t-ui mt-2 max-w-[64ch] text-ink-soft">
              {receipt.comparison.public_explanation}
            </p>
          </div>
          <dl className="t-ui grid content-start gap-4 border-t border-rule pt-6 md:col-span-4 md:border-t-0 md:border-l md:pt-0 md:pl-6">
            <div>
              <dt className="t-meta">Stamped</dt>
              <dd className="text-ink">{formatStamp(receipt.generated_at)}</dd>
            </div>
            <div>
              <dt className="t-meta">Historical cutoff</dt>
              <dd className="text-ink">
                End of {formatDay(receipt.evidence.historical_cutoff)}, UTC
              </dd>
            </div>
            <div>
              <dt className="t-meta">Chain</dt>
              <dd className="text-ink">{chainName(receipt.claim.chain)}</dd>
            </div>
            <div>
              <dt className="t-meta">Integrity on this deployment</dt>
              <dd className="text-ink">
                {report.ok
                  ? `Verified, ${report.checks.length} checks passed`
                  : 'Failed verification'}
                {report.signer ? (
                  <span className="block text-ink-soft">
                    Signed with {SIGNER_TEXT[report.signer.role]}
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
        </header>

        <div className="mt-12 md:mt-16">
          <TemporalComparator
            state={{ kind: 'result', receipt, mode: fixture ? 'fixture' : 'replay' }}
            showVerdict={false}
            footer={<ReceiptActions receipt={receipt} surface="receipt" />}
          />
        </div>

        <div className="mt-16">
          {receipt.restamp_of ? (
            <DocketRow title="Restamp">
              <p>
                This receipt restamps{' '}
                <Link
                  href={`/r/${receipt.restamp_of}`}
                  className="text-ink underline decoration-rule-strong underline-offset-4"
                >
                  {receipt.restamp_of}
                </Link>
                . The original is unchanged.
              </p>
              {driftFromOriginal ? <p>{driftSentences(driftFromOriginal).join(' ')}</p> : null}
            </DocketRow>
          ) : null}

          <DocketRow title="Method snapshot" id="method">
            <p>
              Method {receipt.method_version}, engine {receipt.engine_version}. A side supports the
              claim when its Smart Money net flow or position clears{' '}
              {usdFull(receipt.evidence.threshold.usd)} in the claimed direction (
              {receipt.evidence.threshold.rule}).
            </p>
            <p>
              Smart Money labels: {receipt.claim.sm_label_set.join(', ')}. Window:{' '}
              {formatDay(receipt.evidence.window.from)} to {formatDay(receipt.evidence.window.to)},
              UTC.{' '}
              <Link
                href="/method"
                className="text-ink underline decoration-rule-strong underline-offset-4"
              >
                Read the method
              </Link>
            </p>
          </DocketRow>

          <DocketRow title="Commitments" id="commitments">
            <p>
              {receipt.commitments.payload_count} stored Nansen responses are committed to by hash.
              The private commitment is the hash of the evidence bundle that holds them, so neither
              can change without breaking this receipt.
            </p>
            <dl className="space-y-2">
              <Hash label="Claim hash" value={receipt.claim_hash} />
              <Hash label="Payload root" value={receipt.commitments.payload_root} />
              <Hash label="Private commitment" value={receipt.commitments.internal_commitment} />
              {receipt.signature ? (
                <Hash label="Public hash" value={receipt.signature.public_hash} />
              ) : null}
              {receipt.signature ? (
                <Hash label="Signing key" value={receipt.signature.key_id} />
              ) : null}
            </dl>
          </DocketRow>

          <DocketRow title="Restatement" id="restatement">
            <p>{receipt.restatement_notice}</p>
            {restamps.length > 0 ? (
              <RestampList restamps={restamps} />
            ) : (
              <p>No restamp of this receipt exists yet.</p>
            )}
            {fixture ? null : <RestampAction receiptId={receipt.receipt_id} />}
          </DocketRow>

          {receipt.claim.source_url || receipt.claim.source_text_sha256 ? (
            <DocketRow title="Source" id="source">
              {receipt.claim.source_url ? (
                <p>
                  <a
                    href={receipt.claim.source_url}
                    rel="noreferrer nofollow"
                    className="break-all text-ink underline decoration-rule-strong underline-offset-4"
                  >
                    {receipt.claim.source_url}
                  </a>
                </p>
              ) : null}
              {receipt.claim.source_text_sha256 ? (
                <p>
                  The claim text is kept private; its hash is{' '}
                  <span className="font-mono text-[12px] break-all text-ink">
                    {receipt.claim.source_text_sha256}
                  </span>
                  .
                </p>
              ) : null}
            </DocketRow>
          ) : null}

          {wallets ? (
            <DocketRow title="Wallet-level diagnostics" id="wallets">
              <p>
                Shown because this deployment records Nansen&apos;s written approval for
                wallet-level detail. Without it, THEN publishes aggregate support only.
              </p>
              {wallets.kind === 'trades' ? (
                wallets.rows.length > 0 ? (
                  <WalletTable rows={wallets.rows} />
                ) : (
                  <p>Neither side counted a Smart Money wallet in the window.</p>
                )
              ) : (
                <p>Holdings claims are compared in aggregate, so there is no wallet-level view.</p>
              )}
            </DocketRow>
          ) : null}

          <DocketRow title="What this is not">
            <p>{receipt.disclaimer}</p>
          </DocketRow>
        </div>
      </div>
    </article>
  )
}
