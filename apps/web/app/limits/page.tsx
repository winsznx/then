import {
  CHAIN_COVERAGE,
  CHAIN_DISPLAY,
  CHAINS,
  DISCLAIMER,
  FUND_COHORT_EXIT_DATE,
  RESTATEMENT_NOTICE,
} from '@then/core'
import type { Metadata } from 'next'
import Link from 'next/link'
import { DocLayout } from '@/components/site/doc-layout'
import { formatDay } from '@/lib/format'

export const metadata: Metadata = {
  title: 'Limits',
  description:
    'What THEN cannot tell you: beta history, restatements, coverage, credits, redistribution, settlement, and the trading gate.',
}

const POLICY_VERSION = '2026-09-24'

const SECTIONS = [
  { id: 'beta', title: 'Historical beta' },
  { id: 'restatements', title: 'Restatements' },
  { id: 'coverage', title: 'Coverage' },
  { id: 'snapshots', title: 'Missing snapshots' },
  { id: 'settlement', title: 'Current-day settlement' },
  { id: 'caps', title: 'Row caps and time limits' },
  { id: 'credits', title: 'Credits' },
  { id: 'redistribution', title: 'Redistribution' },
  { id: 'fund', title: 'Fund wallets' },
  { id: 'price', title: 'No price prediction' },
  { id: 'trading', title: 'Trading gate' },
  { id: 'disclaimer', title: 'Disclaimer' },
]

function Mark({ on }: { on: boolean }) {
  return <span className={on ? 'text-ink' : 'text-meta'}>{on ? 'Yes' : 'No'}</span>
}

export default function LimitsPage() {
  return (
    <DocLayout
      title="What THEN cannot tell you."
      lead={
        <p>
          A verdict is only as good as the dated record behind it. These are the boundaries of that
          record, and the places where THEN answers INSUFFICIENT instead of guessing.
        </p>
      }
      meta={<>Policy version {POLICY_VERSION}</>}
      sections={SECTIONS}
    >
      <section id="beta">
        <h2>Historical beta</h2>
        <p>
          Nansen&apos;s point-in-time endpoints are in beta, and their response shapes can change.
          THEN checks every response against a schema. A shape it does not recognize is treated as
          unavailable and recorded as schema drift, never read by guesswork, so a changed endpoint
          produces INSUFFICIENT rather than a wrong verdict.
        </p>
      </section>

      <section id="restatements">
        <h2>Restatements</h2>
        <p>{RESTATEMENT_NOTICE}</p>
        <p>
          A restamp is a new receipt with a drift report beside it, including whether the method
          changed in between.
        </p>
      </section>

      <section id="coverage">
        <h2>Coverage</h2>
        <p>
          Buy and sell claims need Nansen&apos;s dated wallet history on the chain. Holdings claims
          need its daily Smart Money snapshots. Anything else is INSUFFICIENT with the reason on the
          receipt. Perp positioning has no dated surface yet and is always INSUFFICIENT.
        </p>
        <div
          role="region"
          aria-label="Chain coverage"
          tabIndex={0}
          className="mt-6 overflow-x-auto"
        >
          <table className="t-ui w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="t-meta border-b border-rule-strong">
                <th scope="col" className="py-2 pr-4 font-normal">
                  Chain
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Bought, sold
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Held
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Price history
                </th>
                <th scope="col" className="py-2 font-normal">
                  Trade preparation
                </th>
              </tr>
            </thead>
            <tbody>
              {CHAINS.map((chain) => {
                const coverage = CHAIN_COVERAGE[chain]
                return (
                  <tr key={chain} className="border-b border-rule">
                    <th scope="row" className="py-2 pr-4 font-normal text-ink">
                      {CHAIN_DISPLAY[chain]}
                    </th>
                    <td className="py-2 pr-4">
                      <Mark on={coverage.wallet_history} />
                    </td>
                    <td className="py-2 pr-4">
                      <Mark on={coverage.sm_snapshot} />
                    </td>
                    <td className="py-2 pr-4">
                      <Mark on={coverage.ohlcv_history} />
                    </td>
                    <td className="py-2">
                      <Mark on={coverage.trade} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p>
          Point-in-time coverage for every holder segment starts on {formatDay('2025-03-11')}.
          Earlier claim dates can come back with no snapshot.
        </p>
      </section>

      <section id="snapshots">
        <h2>Missing snapshots</h2>
        <p>
          Holdings snapshots are taken at the end of each UTC day. When Nansen returns none for the
          claim date, the stamp is INSUFFICIENT. THEN never substitutes a neighboring day, and it
          never moves the claim date.
        </p>
      </section>

      <section id="settlement">
        <h2>Current-day settlement</h2>
        <p>
          Today has no settled snapshot, so THEN will not stamp it. Yesterday can be stamped and is
          marked recent, because Nansen may still revise it for about two days after the close.
        </p>
      </section>

      <section id="caps">
        <h2>Row caps and time limits</h2>
        <p>
          Each source reads at most three pages of 1,000 rows, and a stamp stops after 45 seconds. A
          source cut off by the cap is partial and counts as UNKNOWN. A source that has not answered
          in time counts as unavailable. Either way, a busy token can come back INSUFFICIENT.
        </p>
      </section>

      <section id="credits">
        <h2>Credits</h2>
        <p>
          Every stamp spends Nansen API credits. In the first corpus run a holdings claim used 3
          credits and a buy or sell claim used 7; a possible CONTAMINATED verdict adds one
          historical lookup of 5 credits. The public deployment limits stamps per visitor per hour
          and pauses stamping when its credits run low, while stored receipts and the Challenge keep
          working. With your own Nansen key, the command line has no such limit.
        </p>
      </section>

      <section id="redistribution">
        <h2>Redistribution</h2>
        <p>
          Nansen&apos;s terms restrict republishing Smart Money data, including outputs that could
          be used to rebuild its wallet classifications. Public receipts therefore carry support
          states, rules, timestamps, and hashes only: no wallet addresses, no wallet counts, no
          Smart Money dollar amounts. That detail stays in private evidence bundles. Wallet-level
          views stay off unless Nansen approves them in writing.
        </p>
      </section>

      <section id="fund">
        <h2>Fund wallets</h2>
        <p>
          Fund wallets left Nansen&apos;s Smart Money cohort on {formatDay(FUND_COHORT_EXIT_DATE)}.
          THEN never asks today&apos;s-label endpoints for Fund. For earlier dates, Fund can be
          included on the as-of side, and the receipt records that it was.
        </p>
      </section>

      <section id="price">
        <h2>No price prediction</h2>
        <p>
          VALID says the cohort of the day supported the claim. It does not say the claim was a good
          trade, then or now. The corpus page shows a seven-day forward return for evaluation only;
          it never feeds a verdict.
        </p>
      </section>

      <section id="trading">
        <h2>Trading gate</h2>
        <ul>
          <li>
            Only a verified VALID stamp can prepare a buy; CONTAMINATED, INSUFFICIENT, and fixture
            receipts are refused on the server. Inspect offers it only right after a new stamp.
          </li>
          <li>Nansen Trading supports Solana and Base, so only those chains can prepare.</li>
          <li>
            The public deployment runs in paper mode by default and records a hashed intent without
            sending anything.
          </li>
          <li>
            In live mode, Nansen prepares an unsigned transaction for your own wallet. THEN never
            holds a key, never signs, and never broadcasts.
          </li>
          <li>Amounts are limited to 5 to 1,000 USDC.</li>
        </ul>
      </section>

      <section id="disclaimer">
        <h2>Disclaimer</h2>
        <p>{DISCLAIMER}</p>
        <p>
          THEN is not financial advice and is not affiliated with Nansen beyond using its API. Read
          the <Link href="/method">method</Link> before relying on a verdict.
        </p>
      </section>
    </DocLayout>
  )
}
