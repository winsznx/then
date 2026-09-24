import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { formatStamp } from '@/lib/format'
import { env } from '@/lib/server/env'
import type { StampUnavailable } from '@/lib/server/stamp'
import { deploymentStatus } from '@/lib/server/status'

export const metadata: Metadata = {
  title: 'Status',
  description:
    'What this THEN deployment can do right now: new stamps, stored receipts, the Challenge, and its configuration.',
}

const LINK = 'text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink'

const PAUSED: Record<StampUnavailable, string> = {
  QUOTA_REACHED:
    "Paused. This deployment's Nansen credits are below what one stamp needs. Stored receipts, verification, and the Challenge still work.",
  UPSTREAM_BUSY: 'Paused for up to a minute. Nansen rate-limited a recent stamp.',
  NO_API_KEY: 'Off. This deployment has no Nansen API key.',
  NO_SIGNING_KEY: 'Off. This deployment has no receipt signing key.',
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export default async function StatusPage() {
  await connection()
  const status = await deploymentStatus()

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: 'New stamps',
      value: status.stamping
        ? PAUSED[status.stamping]
        : `Available, up to ${plural(status.stampsPerHour, 'stamp')} an hour per visitor.`,
    },
    {
      label: 'Stored receipts and the Challenge',
      value: status.counts
        ? `Available: ${plural(status.counts.receipts, 'receipt')}, ${plural(status.counts.cases, 'Challenge case')}, ${plural(status.counts.corpusRuns, 'corpus run')}.`
        : 'Unavailable. The database did not answer.',
    },
    {
      label: 'Point-in-time data',
      value: status.historical
        ? 'On.'
        : 'Off. While it is off every stamp is INSUFFICIENT, which is the ablation check.',
    },
    {
      label: 'Method',
      value: (
        <Link href="/method" className={LINK}>
          {status.methodVersion}
        </Link>
      ),
    },
    {
      label: 'Trade preparation',
      value:
        status.tradeMode === 'live'
          ? 'Unsigned transactions for your own wallet to sign.'
          : 'Paper intents only.',
    },
    {
      label: 'Receipt signing key',
      value: status.signingKeyId ? (
        <a href="/.well-known/then-receipt-keys" className={`${LINK} font-mono text-[13px]`}>
          {status.signingKeyId}
        </a>
      ) : (
        'None.'
      ),
    },
    {
      label: 'Deployed commit',
      value: status.commit ? (
        <a
          href={`${env.githubUrl}/commit/${status.commit}`}
          rel="noreferrer"
          className={`${LINK} font-mono text-[13px]`}
        >
          {status.commit.slice(0, 12)}
        </a>
      ) : (
        'Not recorded.'
      ),
    },
    { label: 'Checked', value: formatStamp(status.checkedAt) },
  ]

  return (
    <div className="page pt-10 pb-24 md:pt-16 md:pb-32">
      <header className="max-w-[900px]">
        <h1 className="t-h2">Status.</h1>
        <p className="t-lead mt-5 max-w-[62ch]">
          What this deployment can do right now, checked when this page loaded.
        </p>
      </header>
      <dl className="t-ui mt-12 max-w-[900px] border-t border-rule md:mt-16">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid gap-1 border-b border-rule py-4 md:grid-cols-12 md:gap-6"
          >
            <dt className="t-meta md:col-span-4">{row.label}</dt>
            <dd className="min-w-0 text-ink md:col-span-8">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
