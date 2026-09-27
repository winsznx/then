import Link from 'next/link'
import type { CorpusRunView } from '@/lib/server/corpus'

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-t border-rule-strong pt-4">
      <p className="font-display text-[48px] leading-none tabular-nums md:text-[64px]">{value}</p>
      <p className="t-ui mt-2 max-w-[24ch] text-ink-soft">{label}</p>
    </div>
  )
}

/** Measured numbers only, each with its denominator; the held-out run is reported as not yet run. */
export function EvidenceSummary({
  run,
  heldOutRun,
}: {
  run: CorpusRunView | null
  heldOutRun: boolean
}) {
  return (
    <section aria-labelledby="evidence-heading" className="page section-y">
      <h2 id="evidence-heading" className="t-h2 max-w-[16ch]">
        Evidence, not a favorable screenshot.
      </h2>
      {run ? (
        <>
          <p className="t-lead mt-6 max-w-[62ch]">
            {run.summary.claims_tested} public claims were frozen before any verdict existed. The
            first run stamped {run.summary.claims_stamped} of them before its credit budget ran out.
          </p>
          <div className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              value={`${run.summary.complete_dual}/${run.summary.claims_stamped}`}
              label="claims with both reconstructions complete"
            />
            <Stat
              value={`${run.summary.drift_25pct}/${run.summary.complete_dual}`}
              label="where the two sides differ by 25% or more"
            />
            <Stat
              value={`${run.summary.support_disagreements}/${run.summary.complete_dual}`}
              label="where they disagree on support"
            />
            <Stat
              value={`${run.summary.claims_tested - run.summary.claims_stamped}`}
              label="left for the held-out run"
            />
          </div>
          <div className="t-ui mt-10 max-w-[70ch] space-y-3 text-ink-soft">
            <p>
              The labels moved on most claims, but under the first threshold no verdict changed. The
              method was revised on that finding and is being tested on the claims it has not seen.{' '}
              {heldOutRun
                ? 'That run is published on the evidence page.'
                : 'That run has not happened yet, so no disagreement rate is claimed.'}
            </p>
            <p>
              <Link
                href="/corpus"
                className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
              >
                See every claim and receipt
              </Link>
            </p>
          </div>
        </>
      ) : (
        <p className="t-lead mt-6 max-w-[62ch]">
          Frozen corpus experiment: not yet run. No disagreement percentage is published.
        </p>
      )}
    </section>
  )
}
