import { METHOD_VERSION } from '@then/core'
import type { Metadata } from 'next'
import Link from 'next/link'
import { CorpusTable } from '@/components/corpus/corpus-table'
import { chainName, formatDay } from '@/lib/format'
import { CORPUS_FROZEN_ON, loadCorpusView, type CorpusRunView } from '@/lib/server/corpus'
import { env } from '@/lib/server/env'
import { connection } from 'next/server'

export const metadata: Metadata = {
  title: 'Evidence',
  description:
    'A corpus of public Smart Money claims, frozen before any verdict, stamped with both reconstructions. What was measured, and what was not.',
}

function Figure({ value, label, detail }: { value: string; label: string; detail?: string }) {
  return (
    <div className="border-t border-rule pt-4">
      <p className="font-display text-[44px] leading-none tabular-nums md:text-[56px]">{value}</p>
      <p className="t-ui mt-2 text-ink">{label}</p>
      {detail ? <p className="t-ui text-ink-soft">{detail}</p> : null}
    </div>
  )
}

function Target({
  id,
  claim,
  status,
  children,
}: {
  id: string
  claim: string
  status: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2 border-t border-rule py-6 md:grid-cols-12 md:gap-6">
      <p className="t-meta md:col-span-2">{id}</p>
      <div className="md:col-span-7">
        <p className="t-ui font-medium text-ink">{claim}</p>
        <div className="t-ui mt-1 space-y-2 text-ink-soft">{children}</div>
      </div>
      <p className="t-meta md:col-span-3 md:text-right">
        <span className="rounded-full border border-rule-strong px-2.5 py-1 text-ink">
          {status}
        </span>
      </p>
    </div>
  )
}

function distribution(run: CorpusRunView): { chain: string; stamped: number; total: number }[] {
  const byChain = new Map<string, { stamped: number; total: number }>()
  for (const row of run.rows) {
    const entry = byChain.get(row.chain) ?? { stamped: 0, total: 0 }
    entry.total += 1
    if (row.status === 'stamped') entry.stamped += 1
    byChain.set(row.chain, entry)
  }
  return [...byChain.entries()]
    .map(([chain, counts]) => ({ chain, ...counts }))
    .sort((a, b) => b.total - a.total)
}

export default async function CorpusPage() {
  await connection()
  const { runs } = await loadCorpusView()
  const first = runs[0]
  const heldOut = runs.find((run) => run.method_version === METHOD_VERSION)

  return (
    <div className="page pt-10 pb-24 md:pt-16 md:pb-32">
      <header className="max-w-[900px]">
        <p className="t-meta">Frozen claim corpus</p>
        <h1 className="t-h2 mt-6">Did the two clocks disagree?</h1>
        <p className="t-lead mt-5 max-w-[62ch]">
          Public Smart Money claims, chosen and frozen on {formatDay(CORPUS_FROZEN_ON)} before THEN
          produced a single verdict, then stamped in file order. Every number below comes from a
          published receipt or a run summary, with its denominator.
        </p>
      </header>

      {!first ? (
        <p className="t-lead mt-12">No corpus run is published on this deployment yet.</p>
      ) : (
        <>
          <section aria-labelledby="s0-heading" className="mt-14 md:mt-20">
            <h2 id="s0-heading" className="t-h3">
              First run: {first.summary.claims_stamped} of {first.summary.claims_tested} claims
              stamped
            </h2>
            <p className="t-ui mt-2 max-w-[70ch] text-ink-soft">
              Method {first.method_version}, run {formatDay(first.created_at)}. The remaining claims
              were not run because the credit budget ran out; none was skipped for its content.
            </p>
            <div className="mt-8 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              <Figure
                value={`${first.summary.complete_dual}/${first.summary.claims_stamped}`}
                label="Both reconstructions complete"
                detail="Today's labels and the dated cohort were each recoverable."
              />
              <Figure
                value={`${first.summary.support_disagreements}/${first.summary.complete_dual}`}
                label="Support disagreements"
                detail="Claims where one side supported and the other did not."
              />
              <Figure
                value={`${first.summary.drift_25pct}/${first.summary.complete_dual}`}
                label="Sides differ by 25% or more"
                detail="The two reconstructions moved apart without crossing the threshold."
              />
              <Figure
                value={`${first.summary.verdicts.INSUFFICIENT ?? 0}/${first.summary.claims_stamped}`}
                label="INSUFFICIENT"
                detail={`VALID ${first.summary.verdicts.VALID ?? 0}, CONTAMINATED ${first.summary.verdicts.CONTAMINATED ?? 0}.`}
              />
            </div>
            <div className="t-ui mt-10 max-w-[70ch] space-y-3 text-ink-soft">
              <p>
                What this run showed: the label drift is real and large, but under the support
                threshold used then, two percent of the window&apos;s DEX volume, neither side of
                any buy claim reached support. One cohort&apos;s net flow is a small share of a
                token&apos;s gross volume, while public claims cite flows of exactly that size. The
                rule could not confirm a true buy claim on a liquid token, so no verdict changed.
              </p>
              <p>
                The method was revised on that argument, not on a re-scored result. Method{' '}
                {METHOD_VERSION} judges buy and sell claims against the claim&apos;s own minimum and
                keeps the volume rule for holdings. First-run receipts keep their original method
                and still verify under it.
              </p>
            </div>
          </section>

          <section aria-labelledby="targets-heading" className="mt-16 md:mt-24">
            <h2 id="targets-heading" className="t-h3">
              What is claimed, and what is not yet
            </h2>
            <div className="mt-6">
              <Target
                id="C5"
                claim="Today's labels and the dated cohort disagree on at least 20% of the frozen corpus."
                status={heldOut ? 'MEASURED' : 'TARGET'}
              >
                <p>
                  First run: {first.summary.support_disagreements} disagreements among{' '}
                  {first.summary.complete_dual} complete claims under method {first.method_version},
                  with {first.summary.claims_tested - first.summary.claims_stamped} claims not run.
                  That does not meet it.{' '}
                  {heldOut
                    ? `Held-out run under method ${heldOut.method_version}: ${heldOut.summary.support_disagreements} of ${heldOut.summary.claims_tested}.`
                    : `The ${first.summary.claims_tested - first.summary.claims_stamped} unstamped claims are pre-registered as a held-out test of method ${METHOD_VERSION}, and that run has not happened yet.`}
                </p>
              </Target>
              <Target
                id="C6"
                claim="Claims stamped CONTAMINATED have a worse 7-day forward return than claims stamped VALID."
                status="TARGET"
              >
                <p>
                  This forward-return hypothesis is not evaluated on this page. Forward returns are
                  evaluation only; they never feed a verdict.
                </p>
              </Target>
            </div>
          </section>

          <section aria-labelledby="claims-heading" className="mt-16 md:mt-24">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="claims-heading" className="t-h3">
                All {first.rows.length} claims
              </h2>
              <p className="t-ui text-ink-soft">
                {distribution(first)
                  .map((entry) => `${chainName(entry.chain)} ${entry.stamped}/${entry.total}`)
                  .join(' · ')}
              </p>
            </div>
            <div className="mt-6">
              <CorpusTable rows={first.rows} caption={`Corpus claims, ${first.label}`} />
            </div>
            <p className="t-ui mt-4 max-w-[80ch] text-meta">
              7D after: close of the claim date to close seven days later, sign-flipped for sell
              claims. Evaluation only, never an input to a verdict, and not a prediction. Smart
              Money dollar amounts and wallet detail stay in private evidence bundles.
            </p>
          </section>

          <section className="mt-16 border-t border-rule pt-8 md:mt-24">
            <p className="t-ui max-w-[70ch] text-ink-soft">
              The selection rules, the frozen claims, and every deviation are in the repository:{' '}
              <a
                href={`${env.githubUrl}/tree/main/eval/corpus`}
                rel="noreferrer"
                className="text-ink underline decoration-rule-strong underline-offset-4"
              >
                eval/corpus
              </a>
              . How a verdict is decided is on the{' '}
              <Link
                href="/method"
                className="text-ink underline decoration-rule-strong underline-offset-4"
              >
                method page
              </Link>
              .
            </p>
          </section>
        </>
      )}
    </div>
  )
}
