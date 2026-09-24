import type { Metadata } from 'next'
import Link from 'next/link'
import { ChallengeGame } from '@/components/challenge/challenge-game'
import { caseView, dailyCase } from '@/lib/server/challenge'
import { readSession } from '@/lib/server/session'
import { connection } from 'next/server'

export const metadata: Metadata = {
  title: 'Daily Challenge',
  description:
    'One real Smart Money claim a day. Decide whether it was true on its date, then see the frozen THEN receipt.',
}

function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-[60ch]">
      <p className="t-meta">THEN / DAILY</p>
      <h1 className="t-h2 mt-6">{title}</h1>
      <p className="t-lead mt-4">{body}</p>
      <Link
        href="/challenge/archive"
        className="t-ui mt-8 inline-flex h-11 items-center rounded-md bg-ink px-4 font-medium text-white transition-colors duration-[var(--dur-fast)] hover:bg-ink-soft"
      >
        Open the archive
      </Link>
    </div>
  )
}

export default async function ChallengePage() {
  await connection()
  const challenge = await dailyCase()
  const view = challenge ? await caseView(challenge, await readSession()) : null
  return (
    <div className="page pt-10 pb-24 md:pt-16 md:pb-32">
      <div className="max-w-[1080px]">
        {!view ? (
          <Unavailable
            title="No Daily case today."
            body="Daily cases come from published, verified receipts, and each case is used as a Daily only once. This deployment has none left to assign."
          />
        ) : view.kind === 'unavailable' ? (
          <Unavailable
            title="Today's case is withdrawn."
            body="Its receipt no longer verifies on this deployment, so THEN will not use it as an answer."
          />
        ) : (
          <ChallengeGame
            key={view.prompt.challenge_id}
            prompt={view.prompt}
            initialReveal={view.kind === 'revealed' ? view.reveal : null}
            initialStats={view.stats}
          />
        )}
        <p className="t-ui mt-16 max-w-[70ch] text-meta">
          Every case is a published receipt, so the answer exists in the open. The game is to reason
          about the claim first.{' '}
          <Link
            href="/challenge/archive"
            className="text-ink-soft underline decoration-rule-strong underline-offset-4"
          >
            Archive
          </Link>
        </p>
      </div>
    </div>
  )
}
