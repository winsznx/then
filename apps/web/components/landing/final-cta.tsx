import Link from 'next/link'

/** The date cut runs through this band at the same offset as in the footer below, so it reads as one line. */
export function FinalCta() {
  return (
    <section
      aria-labelledby="final-heading"
      className="relative overflow-hidden bg-time-wash section-y"
    >
      <div
        aria-hidden="true"
        className="cut-x absolute top-0 bottom-0 hidden w-[2px] bg-time md:block"
      />
      <div className="page relative">
        <div className="md:ml-[calc(100%/3+2.5rem)]">
          <h2 id="final-heading" className="t-hero max-w-[15ch] text-ink">
            Check the date before you trust the label.
          </h2>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link
              href="/inspect"
              className="t-ui inline-flex h-12 items-center rounded-md bg-ink px-6 text-[15px] font-medium text-white transition-colors duration-[var(--dur-fast)] hover:bg-ink-soft"
            >
              Check a claim
            </Link>
            <Link
              href="/method"
              className="t-ui text-[15px] text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
            >
              Read the method
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
