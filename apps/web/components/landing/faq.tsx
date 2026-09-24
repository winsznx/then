import Link from 'next/link'
import { ChevronIcon } from '@/components/icons'

const QUESTIONS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'What does CONTAMINATED mean?',
    a: "Today's Smart Money labels support the claim, but the cohort Nansen recognized on the claim date does not, and the difference comes from wallets that were labeled later. The claim looks true only because of labels that did not exist yet.",
  },
  {
    q: 'Does THEN predict whether a token will go up?',
    a: 'No. It checks whether a claim about the past was true on its date. A VALID stamp says nothing about what the token does next.',
  },
  {
    q: 'Why can Smart Money membership change?',
    a: "Nansen labels wallets by their record. As records change, wallets gain and lose labels, and whole label classes can change, as Fund wallets did when they left the cohort. A trade's date stays fixed while its wallet's label does not.",
  },
  {
    q: 'What data comes from Nansen?',
    a: (
      <>
        Smart Money labels, point-in-time trades, daily holdings snapshots, prices, token search,
        and trade preparation. THEN adds the comparison, the verdict rule, and the receipt.{' '}
        <Link href="/about-data">Data and attribution</Link> has the detail.
      </>
    ),
  },
  {
    q: 'Can a receipt change later?',
    a: 'No. A receipt is hashed and signed when it is stamped. If Nansen restates history, a restamp creates a new receipt beside the original, with a report of what changed.',
  },
  {
    q: 'Why does THEN sometimes return INSUFFICIENT?',
    a: 'When the date has not settled, a snapshot is missing, sources conflict, or the difference cannot be traced to label changes, THEN says it cannot decide rather than guess. INSUFFICIENT is an answer, not an error.',
  },
  {
    q: 'Can I verify a result myself?',
    a: (
      <>
        Yes. Every receipt page checks its signature and hashes in your browser, and the command
        line verifies a downloaded receipt offline. With the private evidence bundle,{' '}
        <code>then verify</code> recomputes the verdict from the stored Nansen responses.
      </>
    ),
  },
]

export function Faq() {
  return (
    <section aria-labelledby="faq-heading" className="page section-y">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-6">
        <h2 id="faq-heading" className="t-h2 lg:col-span-4">
          Questions
        </h2>
        <div className="border-t border-rule-strong lg:col-span-7 lg:col-start-6">
          {QUESTIONS.map((item) => (
            <details key={item.q} className="group border-b border-rule-strong">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 [&::-webkit-details-marker]:hidden">
                <span className="t-ui text-[17px] font-medium text-ink">{item.q}</span>
                <ChevronIcon
                  size={18}
                  className="shrink-0 rotate-90 text-meta transition-transform duration-[var(--dur-fast)] group-open:-rotate-90"
                />
              </summary>
              <div className="t-ui doc max-w-[62ch] pb-6 text-[16px] text-ink-soft">{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
