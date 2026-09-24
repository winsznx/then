import { SHARE_ID_PATTERN } from '@then/core'
import { shareLines } from '@then/challenge'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { getRepo } from '@/lib/server/db'

const loadShare = cache(async (id: string) => {
  if (!SHARE_ID_PATTERN.test(id)) return null
  const share = await (await getRepo()).getShare(id)
  return share ? shareLines(share) : null
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const lines = await loadShare((await params).id)
  if (!lines) return { title: 'Challenge result' }
  return { title: lines[0] ?? 'Challenge result', description: lines.slice(1).join(' ') }
}

/** A shared result. It says whether the player was right, never what the verdict was. */
export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const lines = await loadShare((await params).id)
  if (!lines) notFound()
  const [header, result, tally, question] = lines
  return (
    <div className="page pt-16 pb-24 md:pt-24 md:pb-36">
      <div className="max-w-[760px] border-t-2 border-time pt-8">
        <p className="t-meta font-medium text-ink">{header}</p>
        <p className="t-verdict mt-8 text-[40px] leading-none text-ink md:text-[64px]">{result}</p>
        <p className="t-meta mt-5">{tally}</p>
        <p className="t-h3 mt-12">{question}</p>
        <Link
          href="/challenge"
          className="t-ui mt-8 inline-flex h-12 items-center rounded-md bg-ink px-5 text-[15px] font-medium text-white transition-colors duration-[var(--dur-fast)] hover:bg-ink-soft"
        >
          Play today&apos;s case
        </Link>
        <p className="t-meta mt-12 flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-nansen" />
          Powered by Nansen API
        </p>
      </div>
    </div>
  )
}
