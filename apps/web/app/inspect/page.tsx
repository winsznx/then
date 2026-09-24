import { lastSettledDay } from '@then/core'
import type { Metadata } from 'next'
import { EMPTY_DRAFT, draftFromParams } from '@/components/inspect/draft'
import { InspectWorkspace } from '@/components/inspect/inspect-workspace'
import { env } from '@/lib/server/env'
import { exampleReceipt } from '@/lib/server/receipts'

export const metadata: Metadata = {
  title: 'Inspect',
  description:
    "Stamp one Smart Money claim: today's labels and the cohort Nansen recognized on that date, side by side, with a signed receipt.",
}

export default async function InspectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const initial = draftFromParams(await searchParams) ?? EMPTY_DRAFT
  const example = await exampleReceipt()
  return (
    <div className="page pt-8 pb-24 md:pt-12 md:pb-32">
      <header className="mb-8 md:mb-10">
        <h1 className="t-h2 max-w-[18ch]">Was this Smart Money then?</h1>
        <p className="t-lead mt-4 max-w-[62ch]">
          Enter one claim. THEN reads the same dated activity twice: through today&apos;s Smart
          Money labels, and through the cohort Nansen recognized on that day.
        </p>
      </header>
      <InspectWorkspace
        initial={initial}
        example={example}
        lastSettled={lastSettledDay()}
        tradeMode={env.tradeMode}
        githubUrl={env.githubUrl}
      />
    </div>
  )
}
