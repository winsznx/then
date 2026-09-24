import { type PublicReceipt } from '@then/core'
import { ReceiptActions } from '@/components/receipt/receipt-actions'
import { VerdictWord } from '@/components/verdict/verdict'
import { chainName, formatDay, formatStamp } from '@/lib/format'
import { ClaimSentence } from '@/components/verdict/claim-sentence'

const SPINE: { term: string; note: string }[] = [
  {
    term: 'Historical cutoff',
    note: 'End of the claim date, UTC. Nothing after it decides the verdict.',
  },
  {
    term: 'Method version',
    note: 'The rule the verdict was computed under. An old receipt keeps verifying after the rule changes.',
  },
  {
    term: 'Source hashes',
    note: 'Every stored Nansen response, committed by hash. The raw data stays private.',
  },
  {
    term: 'Signature',
    note: "ed25519, checkable against the deployment's published keys, in the browser or offline.",
  },
  {
    term: 'Restatement',
    note: 'Nansen can restate history. A restamp is a new receipt; this one never changes.',
  },
]

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-3 border-t border-dashed border-rule py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <dt className="t-meta">{term}</dt>
      <dd className="t-meta min-w-0 break-words text-ink">{children}</dd>
    </div>
  )
}

export function ReceiptObject({ receipt }: { receipt: PublicReceipt }) {
  return (
    <section aria-labelledby="receipt-heading" className="bg-band section-y">
      <div className="page">
        <h2 id="receipt-heading" className="t-h2 max-w-[18ch]">
          A receipt that remembers the cutoff.
        </h2>
        <div className="mt-12 grid gap-12 md:mt-16 lg:grid-cols-12 lg:gap-6">
          <article
            aria-label="Public receipt"
            className="rounded-lg border border-rule-strong bg-workspace lg:col-span-7"
          >
            <div className="px-5 pt-6 md:px-8 md:pt-8">
              <p className="t-meta">THEN public receipt</p>
              <p className="t-h3 mt-3">
                <ClaimSentence claim={receipt.claim} />
              </p>
              <p className="mt-4 text-[40px] leading-none md:text-[52px]">
                <VerdictWord verdict={receipt.verdict} />
              </p>
              <dl className="mt-6 pb-2">
                <Row term="Chain">{chainName(receipt.claim.chain)}</Row>
                <Row term="Historical cutoff">
                  End of {formatDay(receipt.evidence.historical_cutoff)}, UTC
                </Row>
                <Row term="Generated">{formatStamp(receipt.generated_at)}</Row>
                <Row term="Method version">{receipt.method_version}</Row>
                <Row term="Source hashes">{receipt.commitments.payload_count} Nansen responses</Row>
                <Row term="Receipt id">{receipt.receipt_id}</Row>
                <Row term="Powered by">Nansen API</Row>
              </dl>
              <p className="t-ui border-t border-dashed border-rule py-4 text-ink-soft">
                {receipt.restatement_notice}
              </p>
            </div>
            <div className="border-t border-rule">
              <ReceiptActions receipt={receipt} surface="inspect" />
            </div>
          </article>
          <ol
            aria-label="What the receipt records"
            className="relative lg:col-span-4 lg:col-start-9 lg:self-start"
          >
            <span
              aria-hidden="true"
              className="absolute top-2 bottom-2 left-[5px] w-px bg-rule-strong"
            />
            {SPINE.map((item) => (
              <li key={item.term} className="relative pb-8 pl-8 last:pb-0">
                <span
                  aria-hidden="true"
                  className="absolute top-[7px] left-0 h-[11px] w-[11px] border border-ink bg-band"
                />
                <p className="t-ui font-medium text-ink">{item.term}</p>
                <p className="t-ui mt-1 text-ink-soft">{item.note}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
