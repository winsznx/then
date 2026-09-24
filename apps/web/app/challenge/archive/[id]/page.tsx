import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChallengeGame } from '@/components/challenge/challenge-game'
import { caseView } from '@/lib/server/challenge'
import { getRepo } from '@/lib/server/db'
import { readSession } from '@/lib/server/session'

export const metadata: Metadata = {
  title: 'Challenge case',
  description:
    'Decide whether a published Smart Money claim was true on its date, then see the frozen THEN receipt.',
}

export default async function ArchiveCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const challenge = /^ch_[a-z2-7]{16}$/.test(id) ? await (await getRepo()).getCase(id) : null
  if (!challenge) notFound()
  const view = await caseView(challenge, await readSession())
  return (
    <div className="page pt-10 pb-24 md:pt-16 md:pb-32">
      <div className="max-w-[1080px]">
        <Link
          href="/challenge/archive"
          className="t-ui text-ink-soft underline decoration-rule-strong underline-offset-4 hover:text-ink"
        >
          All cases
        </Link>
        <div className="mt-6">
          {view.kind === 'unavailable' ? (
            <div className="max-w-[60ch]">
              <h1 className="t-h2">This case is withdrawn.</h1>
              <p className="t-lead mt-4">
                Its receipt no longer verifies on this deployment, so THEN will not use it as an
                answer.
              </p>
            </div>
          ) : (
            <ChallengeGame
              key={view.prompt.challenge_id}
              prompt={view.prompt}
              initialReveal={view.kind === 'revealed' ? view.reveal : null}
              initialStats={view.stats}
            />
          )}
        </div>
      </div>
    </div>
  )
}
