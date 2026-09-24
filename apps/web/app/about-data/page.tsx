import type { Metadata } from 'next'
import Link from 'next/link'
import { DocLayout } from '@/components/site/doc-layout'
import { env } from '@/lib/server/env'

export const metadata: Metadata = {
  title: 'Data and attribution',
  description:
    'Which Nansen data THEN uses, what it publishes, what stays private, and how fresh it is.',
}

const SECTIONS = [
  { id: 'attribution', title: 'Attribution' },
  { id: 'sources', title: 'Source classes' },
  { id: 'public', title: 'What is published' },
  { id: 'private', title: 'What stays private' },
  { id: 'mode', title: 'Redistribution mode' },
  { id: 'freshness', title: 'Freshness' },
  { id: 'keys', title: 'Keys and signing' },
]

export default function AboutDataPage() {
  return (
    <DocLayout
      title="Data and attribution."
      lead={
        <p>
          THEN is built on the Nansen API. Nansen supplies the labels, the dated activity, and the
          point-in-time snapshots. THEN compares them, applies one verdict rule, and signs a
          receipt.
        </p>
      }
      sections={SECTIONS}
    >
      <section id="attribution">
        <h2>Attribution</h2>
        <p>
          Smart Money labels, historical trades, holdings snapshots, token search, prices, and trade
          preparation all come from the{' '}
          <a href="https://docs.nansen.ai" rel="noreferrer">
            Nansen API
          </a>
          . Every receipt says so in its <code>powered_by</code> field, and every page that shows
          Nansen data carries the attribution.
        </p>
      </section>

      <section id="sources">
        <h2>Source classes</h2>
        <ul>
          <li>
            <strong>Historical cohort.</strong> Point-in-time DEX trades labeled as of each trade,
            and daily Smart Money holdings snapshots. This is the as-of side.
          </li>
          <li>
            <strong>Dated activity.</strong> Daily price and volume for the claim window, used as
            the one reference price for both sides.
          </li>
          <li>
            <strong>Current-label replay.</strong> The same window read through today&apos;s Smart
            Money labels. This is the side most dashboards show.
          </li>
        </ul>
        <p>
          The exact endpoints, credit costs, and request shapes are listed in the repository&apos;s{' '}
          <a href={`${env.githubUrl}/blob/main/ARCHITECTURE.md`} rel="noreferrer">
            architecture notes
          </a>
          .
        </p>
      </section>

      <section id="public">
        <h2>What is published</h2>
        <p>
          A public receipt holds the claim, whether each side supports it, the verdict and its
          public reasons, the threshold rule, the window and cutoff, timestamps, the method version,
          and hashes of every stored Nansen response. None of it can be used to rebuild who Nansen
          counts as Smart Money.
        </p>
      </section>

      <section id="private">
        <h2>What stays private</h2>
        <p>
          Raw Nansen responses, wallet addresses, wallet counts, per-wallet labels, and Smart Money
          dollar amounts. They live in a private evidence bundle that the public receipt commits to
          by hash. The bundle is never linked from the site and is served only to an operator
          holding the admin token.
        </p>
      </section>

      <section id="mode">
        <h2>Redistribution mode</h2>
        <p>
          This deployment runs in <strong>aggregate mode</strong>
          {env.publicMembershipDetail
            ? ', with wallet-level detail enabled under a recorded written approval from Nansen.'
            : '. Wallet-level detail is switched off and stays off unless Nansen approves it in writing.'}{' '}
          The corpus page publishes counts across claims, never per-claim Smart Money values.
        </p>
      </section>

      <section id="freshness">
        <h2>Freshness</h2>
        <p>
          Today&apos;s-label data is as current as Nansen&apos;s labels at the moment of the stamp.
          Point-in-time data is fixed per UTC day once it settles, about two days after the close.
          Nansen can still restate history later; a receipt keeps what was read when it was stamped.
          See <Link href="/limits#restatements">restatements</Link>.
        </p>
      </section>

      <section id="keys">
        <h2>Keys and signing</h2>
        <p>
          The Nansen API key lives on the server only. The browser can reach this site&apos;s own
          routes and nothing else, so it has no path to Nansen. Receipts are signed with ed25519;
          the public keys this deployment trusts are published at{' '}
          <a href="/.well-known/then-receipt-keys">/.well-known/then-receipt-keys</a>, and the
          command-line verifier can pin them.
        </p>
      </section>
    </DocLayout>
  )
}
