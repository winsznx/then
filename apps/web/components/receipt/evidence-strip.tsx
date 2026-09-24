import type { PublicReceipt, SourceClass, SourceStatus } from '@then/core'
import { formatDay, usdFull } from '@/lib/format'

const SOURCE_LABEL: Record<SourceClass, string> = {
  historical_cohort: 'Historical cohort',
  dated_activity: 'Dated activity',
  current_label_replay: 'Current-label replay',
}

const SOURCE_STATUS_TEXT: Record<SourceStatus, string> = {
  complete: 'complete',
  partial: 'partial (row cap reached)',
  unavailable: 'unavailable',
  disabled: 'switched off',
  not_run: 'not run',
}

const SETTLEMENT_TEXT: Record<PublicReceipt['evidence']['settlement'], string> = {
  settled: 'Settled day',
  recent: 'Recent day: Nansen may still revise it',
  unsettled: 'Not settled',
}

function windowText(receipt: PublicReceipt): string {
  const { from, to } = receipt.evidence.window
  const days = receipt.claim.window_hours / 24
  return from === to
    ? `${formatDay(to)}, 1 day`
    : `${formatDay(from)} to ${formatDay(to)}, ${days} days`
}

function thresholdText(receipt: PublicReceipt): string {
  const { usd, basis } = receipt.evidence.threshold
  return basis === 'volume'
    ? `${usdFull(usd)}, 2% of window DEX volume`
    : `${usdFull(usd)}, the claim minimum`
}

/**
 * What the verdict stands on, in public-safe terms: the window, the support threshold, how
 * complete each source class was, and whether the day has settled. No Smart Money amounts.
 */
export function EvidenceStrip({ receipt }: { receipt: PublicReceipt }) {
  const items: { term: string; detail: React.ReactNode }[] = [
    { term: 'Window (UTC)', detail: windowText(receipt) },
    { term: 'Support threshold', detail: thresholdText(receipt) },
    {
      term: 'Sources',
      detail: (
        <ul className="space-y-0.5">
          {receipt.evidence.sources.map((source) => (
            <li key={source.class}>
              {SOURCE_LABEL[source.class]}:{' '}
              <span className={source.status === 'complete' ? '' : 'font-medium text-ink'}>
                {SOURCE_STATUS_TEXT[source.status]}
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    { term: 'Settlement', detail: SETTLEMENT_TEXT[receipt.evidence.settlement] },
  ]
  return (
    <dl className="grid gap-x-8 gap-y-5 border-t border-rule px-5 py-6 sm:grid-cols-2 md:px-8 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.term} className="min-w-0">
          <dt className="t-meta">{item.term}</dt>
          <dd className="t-ui mt-1 text-ink-soft">{item.detail}</dd>
        </div>
      ))}
    </dl>
  )
}
