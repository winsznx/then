import { color } from '@then/ui'
import { ImageResponse } from 'next/og'
import { OG_SIZE, OgFrame, ogFonts } from '@/lib/server/og'

export const alt = "THEN: Smart Money changes. History shouldn't."
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    <OgFrame footer="Check the date before you trust the label.">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Instrument Serif',
          fontSize: 96,
          lineHeight: 0.98,
          letterSpacing: -2,
        }}
      >
        <div>Smart Money changes.</div>
        <div>History shouldn&apos;t.</div>
      </div>
      <div
        style={{ marginTop: 28, fontSize: 28, lineHeight: 1.35, color: color.ink1, maxWidth: 860 }}
      >
        Checks whether a Smart Money claim was true on the date it is used as evidence, with
        Nansen&apos;s point-in-time data.
      </div>
    </OgFrame>,
    { ...size, fonts: await ogFonts() },
  )
}
