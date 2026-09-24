import Link from 'next/link'

const ITEMS = [
  'It does not predict price.',
  'VALID does not mean the trade is good.',
  'Nansen can restate history after a stamp; a receipt keeps what was read at the time.',
  'Point-in-time endpoints are in beta, and their schemas can change.',
  "Public receipts follow Nansen's redistribution limits: no wallet lists, counts, or Smart Money amounts.",
  'The current UTC day has no settled snapshot, so it cannot be stamped.',
]

export function LimitsList() {
  return (
    <section aria-labelledby="limits-heading" className="bg-band section-y">
      <div className="page grid gap-10 lg:grid-cols-12 lg:gap-6">
        <h2 id="limits-heading" className="t-h2 lg:col-span-5">
          What THEN does not tell you.
        </h2>
        <div className="lg:col-span-6 lg:col-start-7">
          <ul className="border-t border-rule-strong">
            {ITEMS.map((item) => (
              <li key={item} className="t-lead border-b border-rule-strong py-4 !text-ink">
                {item}
              </li>
            ))}
          </ul>
          <Link
            href="/limits"
            className="t-ui mt-6 inline-block text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
          >
            Read every limit
          </Link>
        </div>
      </div>
    </section>
  )
}
