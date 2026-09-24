import type { PublicReceipt } from '@then/core'
import Link from 'next/link'
import { TemporalComparator } from '@/components/inspect/temporal-comparator'

export function Hero({ receipt }: { receipt: PublicReceipt | null }) {
  return (
    <section aria-labelledby="hero-heading" className="relative">
      <div className="page pt-14 md:pt-24 xl:pt-28">
        <h1 id="hero-heading" className="t-hero">
          <span className="block">Smart Money changes.</span>
          <span className="block">History shouldn&apos;t.</span>
        </h1>
        <p className="t-lead mt-8 max-w-[620px]">
          THEN checks whether a Smart Money claim was true on the day it is being used as evidence,
          using Nansen&apos;s point-in-time data instead of treating today&apos;s labels as
          historical fact.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Link
            href="/inspect"
            className="t-ui inline-flex h-12 items-center rounded-md bg-ink px-6 text-[15px] font-medium text-white transition-colors duration-[var(--dur-fast)] hover:bg-ink-soft"
          >
            Check a claim
          </Link>
          <a
            href="#how"
            className="t-ui text-[15px] text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
          >
            See how it works
          </a>
        </div>
      </div>
      {receipt ? (
        <div className="page relative z-[var(--z-raised)] mt-16 -mb-48 md:mt-24">
          <p className="t-meta mb-3 flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-nansen" />
            Point-in-time market intelligence powered by Nansen API
          </p>
          <div className="shadow-[var(--shadow-float)]">
            <TemporalComparator
              state={{
                kind: 'result',
                receipt,
                mode: receipt.origin === 'fixture' ? 'fixture' : 'replay',
              }}
              showEvidence={false}
              footer={
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 md:px-8">
                  <p className="t-ui text-ink-soft">
                    A stored receipt from the public corpus, replayed. Not a live result.
                  </p>
                  <Link
                    href={`/r/${receipt.receipt_id}`}
                    className="t-ui text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                  >
                    Open this receipt
                  </Link>
                </div>
              }
            />
          </div>
        </div>
      ) : (
        <div className="h-24" />
      )}
    </section>
  )
}
