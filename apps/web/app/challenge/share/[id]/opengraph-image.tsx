import { shareLines } from '@then/challenge'
import { SHARE_ID_PATTERN } from '@then/core'
import { color } from '@then/ui'
import { ImageResponse } from 'next/og'
import { getRepo } from '@/lib/server/db'
import { env } from '@/lib/server/env'
import { OG_SIZE, OgFrame, ogFonts } from '@/lib/server/og'

export const alt = 'A THEN Challenge result. It does not reveal the answer.'
export const size = OG_SIZE
export const contentType = 'image/png'

/** Spoiler-safe: right or wrong and a streak, never the verdict. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const share = SHARE_ID_PATTERN.test(id) ? await (await getRepo()).getShare(id) : null
  const [header, result, tally, question] = share
    ? shareLines(share)
    : ['THEN / CHALLENGE', 'WOULD YOU HAVE ADMITTED IT?', '', '']
  return new ImageResponse(
    <OgFrame footer={`${env.publicBaseUrl.replace(/^https?:\/\//, '')}/challenge`}>
      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 28, color: color.ink0 }}>{header}</div>
      <div style={{ marginTop: 30, fontSize: 100, fontWeight: 600, letterSpacing: 2 }}>
        {result}
      </div>
      {tally ? (
        <div
          style={{ marginTop: 16, fontFamily: 'IBM Plex Mono', fontSize: 28, color: color.ink2 }}
        >
          {tally}
        </div>
      ) : null}
      {question ? (
        <div style={{ marginTop: 40, fontFamily: 'Instrument Serif', fontSize: 52 }}>
          {question}
        </div>
      ) : null}
    </OgFrame>,
    { ...size, fonts: await ogFonts() },
  )
}
