import type { Metadata } from 'next'
import { ArchiveList } from '@/components/challenge/archive-list'
import { archiveFor } from '@/lib/server/challenge'
import { readSession } from '@/lib/server/session'

export const metadata: Metadata = {
  title: 'Challenge archive',
  description: 'Every Challenge case, each backed by a published and verified THEN receipt.',
}

export default async function ArchivePage() {
  const rows = await archiveFor(await readSession())
  return (
    <div className="page pt-10 pb-24 md:pt-16 md:pb-32">
      <p className="t-meta">THEN / ARCHIVE</p>
      <h1 className="t-h2 mt-6 max-w-[20ch]">Every case, backed by a frozen receipt.</h1>
      <p className="t-lead mt-4 max-w-[60ch]">
        Archive answers count toward your accuracy, not your Daily streak. A case shows its verdict
        here only after you have answered it.
      </p>
      <div className="mt-10 md:mt-14">
        <ArchiveList rows={rows} />
      </div>
    </div>
  )
}
