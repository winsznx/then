import {
  DEFAULT_SM_LABEL_SET,
  DISCLAIMER,
  FUND_COHORT_EXIT_DATE,
  METHOD_VERSION,
  RESTATEMENT_NOTICE,
} from '@then/core'
import type { Metadata } from 'next'
import Link from 'next/link'
import { MethodDiagram } from '@/components/method/method-diagram'
import { DocLayout } from '@/components/site/doc-layout'
import { formatDay } from '@/lib/format'

export const metadata: Metadata = {
  title: 'Method',
  description:
    "How THEN decides: the same claim rebuilt with today's Smart Money labels and with the cohort Nansen recognized on the claim date.",
}

const SECTIONS = [
  { id: 'reconstructions', title: 'Two reconstructions' },
  { id: 'support', title: 'Support' },
  { id: 'verdicts', title: 'Verdict rules' },
  { id: 'contamination', title: 'Proving contamination' },
  { id: 'settlement', title: 'Dates and settlement' },
  { id: 'no-look-ahead', title: 'No look-ahead' },
  { id: 'ablation', title: 'Without point-in-time data' },
  { id: 'receipts', title: 'Receipts' },
  { id: 'versions', title: 'Method versions' },
  { id: 'attribution', title: 'Nansen attribution' },
]

export default function MethodPage() {
  return (
    <DocLayout
      title="Two reconstructions. One date. Three verdicts."
      lead={
        <p>
          THEN rebuilds a Smart Money claim twice: once with the wallets Nansen labels Smart Money
          today, once with the cohort Nansen recognized on the claim date. If the cohort of the day
          supports the claim, the stamp is VALID. If only today&apos;s labels support it, the stamp
          is CONTAMINATED. If the historical record cannot decide, the stamp is INSUFFICIENT. THEN
          does not say the token goes up.
        </p>
      }
      meta={<>Current method {METHOD_VERSION}</>}
      sections={SECTIONS}
    >
      <MethodDiagram />

      <section id="reconstructions" className="mt-16">
        <h2>Two reconstructions</h2>
        <p>
          <strong>Today&apos;s labels.</strong> THEN asks Nansen for Smart Money activity in the
          claim&apos;s window using the labels wallets carry now. This is what a dashboard shows
          when you scroll back: dated trades, present-day labels.
        </p>
        <p>
          <strong>As of the claim date.</strong> THEN asks Nansen&apos;s point-in-time data for the
          same window: DEX trades carrying the label each wallet had when it traded, and daily Smart
          Money holdings snapshots that freeze each day&apos;s cohort at the end of the UTC day.
        </p>
        <p>What each side measures depends on the claim:</p>
        <ul>
          <li>
            <strong>Bought or sold:</strong> Smart Money net token flow over the window, buys minus
            sells, valued at the window&apos;s volume-weighted average price.
          </li>
          <li>
            <strong>Held a material position:</strong> Smart Money holdings of the token at the end
            of the claim date, valued at that day&apos;s close.
          </li>
        </ul>
        <p>
          Both sides use the same window, the same label set, and the same reference price. The
          default label set is {DEFAULT_SM_LABEL_SET.join(', ')}.
        </p>
      </section>

      <section id="support">
        <h2>Support</h2>
        <p>
          A side supports the claim when its number clears the threshold in the claimed direction.
        </p>
        <ul>
          <li>Bought: net flow of at least the claim&apos;s minimum, $1,000 by default.</li>
          <li>Sold: net flow of at least the minimum in the selling direction.</li>
          <li>
            Held: holdings worth at least the larger of the minimum and 2% of the window&apos;s DEX
            volume.
          </li>
        </ul>
        <p>
          A source that hits the row cap is partial. Partial evidence makes a side UNKNOWN, never
          YES or NO, so a truncated page cannot decide a verdict.
        </p>
      </section>

      <section id="verdicts">
        <h2>Verdict rules</h2>
        <p>The engine applies one rule, in this order. The first line that matches decides.</p>
        <ol>
          <li>Point-in-time data is switched off: INSUFFICIENT.</li>
          <li>The claim date has not settled: INSUFFICIENT.</li>
          <li>Nansen has no point-in-time surface for this chain and claim type: INSUFFICIENT.</li>
          <li>No usable point-in-time evidence came back: INSUFFICIENT.</li>
          <li>Point-in-time sources disagree in direction: INSUFFICIENT.</li>
          <li>The as-of cohort supports the claim: VALID.</li>
          <li>Today&apos;s-label replay could not be built: INSUFFICIENT.</li>
          <li>
            Today&apos;s labels support the claim and the difference comes from wallets labeled
            after the date: CONTAMINATED. When the difference cannot be traced to label changes:
            INSUFFICIENT.
          </li>
          <li>Neither side supports the claim: INSUFFICIENT.</li>
        </ol>
        <p>
          VALID needs the cohort of the day. Today&apos;s labels alone can never produce it. There
          is no fourth verdict, and no score between them.
        </p>
      </section>

      <section id="contamination">
        <h2>Proving contamination</h2>
        <p>
          CONTAMINATED is a comparison, so THEN asks for evidence that labels caused the difference
          before it says so.
        </p>
        <ul>
          <li>
            Buy and sell claims: the wallets counted only by today&apos;s labels must carry enough
            flow to explain the gap to the threshold, and one historical lookup of the largest of
            them must show it traded in the window under a label outside the Smart Money set.
          </li>
          <li>
            Holdings claims: the as-of and today&apos;s-label holdings series must agree within 2%
            on a recent settled day, when the two cohorts are nearly the same. That shows the two
            sources measure the same thing, so their difference on the claim date can be read as
            label drift.
          </li>
        </ul>
        <p>If either check fails, the stamp is INSUFFICIENT with the reason on the receipt.</p>
      </section>

      <section id="settlement">
        <h2>Dates and settlement</h2>
        <p>
          All dates are UTC calendar days. A window always ends on the claim date. The current day
          has no settled snapshot, so it cannot be stamped. The previous day can be stamped but is
          marked recent, because Nansen may still revise it. THEN never moves a claim to another day
          on its own.
        </p>
        <p>
          Fund wallets left Nansen&apos;s Smart Money cohort on {formatDay(FUND_COHORT_EXIT_DATE)}.
          Fund is never sent to today&apos;s-label endpoints and may be requested for the as-of side
          only for earlier dates; the receipt records whether it was.
        </p>
      </section>

      <section id="no-look-ahead">
        <h2>No look-ahead</h2>
        <p>
          Point-in-time trade and flow requests end at the claim date. The verdict reads prices only
          inside the window. The price request also covers the seven days after the claim date, and
          that later part is used only to measure the corpus&apos;s forward return, which never
          feeds a verdict. Holdings snapshots after the date are read only to check that the two
          holdings sources agree. No threshold is fitted to returns.
        </p>
      </section>

      <section id="ablation">
        <h2>Without point-in-time data</h2>
        <p>
          With Nansen&apos;s point-in-time endpoints switched off, every stamp is INSUFFICIENT. THEN
          cannot produce VALID or CONTAMINATED from today&apos;s labels alone, and the command line
          exits with code 5 to make that visible. The same replay can be run on any stored receipt:{' '}
          <code>then ablation &lt;receipt&gt;</code>.
        </p>
      </section>

      <section id="receipts">
        <h2>Receipts</h2>
        <p>
          Every stamp writes two layers. The public receipt holds the claim, both support states,
          the verdict, the rule parameters, timestamps, and hashes. The private bundle holds every
          raw Nansen response. The public receipt commits to the private bundle by hash and is
          signed.
        </p>
        <p>
          Anyone can check a public receipt without private data: the schema, the claim hash, the
          receipt id, the verdict recomputed from the published decision inputs, and the signature
          against the deployment&apos;s published keys. With the private bundle,{' '}
          <code>then verify</code> recomputes the verdict from the stored responses with no network
          access.
        </p>
        <p>{RESTATEMENT_NOTICE}</p>
      </section>

      <section id="versions">
        <h2>Method versions</h2>
        <p>
          Each receipt records the method it was stamped under and is always verified under that
          method, so an old receipt keeps verifying after a rule changes.
        </p>
        <ul>
          <li>
            <strong>2026-09-24</strong>: buy, sell, and hold claims all used the larger of the
            minimum and 2% of the window&apos;s DEX volume.
          </li>
          <li>
            <strong>2026-09-24.2</strong>: buy and sell claims use the claim&apos;s minimum. The
            first corpus run showed that comparing one cohort&apos;s net flow with a token&apos;s
            gross volume made true public buy claims on liquid tokens unconfirmable. Holdings keep
            the volume rule. The revised rule was tested on the pre-registered held-out claims;{' '}
            <Link href="/corpus">see the evidence page</Link>.
          </li>
        </ul>
      </section>

      <section id="attribution">
        <h2>Nansen attribution</h2>
        <p>
          Smart Money labels, point-in-time trades, holdings snapshots, and prices come from the
          Nansen API. THEN&apos;s own work is the comparison, the verdict rule, and the receipt.
          What stays private and why is on <Link href="/about-data">data and attribution</Link>.
        </p>
        <p>{DISCLAIMER}</p>
      </section>
    </DocLayout>
  )
}
