import { claimSentence } from '@then/core'
import { color, verdictColor } from '@then/ui'
import { ImageResponse } from 'next/og'
import { chainName, claimTypeName } from '@/lib/format'
import { env } from '@/lib/server/env'
import { OG_SIZE, OgFrame, ogFonts } from '@/lib/server/og'
import { loadReceiptView } from '@/lib/server/receipts'

export const alt = 'THEN receipt: the verdict for one Smart Money claim'
export const size = OG_SIZE
export const contentType = 'image/png'

/** The shared card for a receipt: claim, verdict, and the plain reason. No Smart Money amounts. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const view = await loadReceiptView((await params).id)
  const fonts = await ogFonts()
  if (!view) {
    return new ImageResponse(
      <OgFrame footer={env.publicBaseUrl.replace(/^https?:\/\//, '')}>
        <div style={{ fontFamily: 'Instrument Serif', fontSize: 72 }}>Receipt not found</div>
      </OgFrame>,
      { ...size, fonts },
    )
  }
  const { receipt } = view
  return new ImageResponse(
    <OgFrame footer={`${env.publicBaseUrl.replace(/^https?:\/\//, '')}/r/${receipt.receipt_id}`}>
      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 26, color: color.ink2 }}>
        {`${chainName(receipt.claim.chain)} · ${claimTypeName(receipt.claim.claim_type)}${receipt.claim.window_hours > 24 ? ` · ${receipt.claim.window_hours / 24}-day window` : ''}`}
      </div>
      <div
        style={{ marginTop: 18, fontFamily: 'Instrument Serif', fontSize: 52, lineHeight: 1.05 }}
      >
        {claimSentence(receipt.claim)}
      </div>
      <div
        style={{
          marginTop: 26,
          fontSize: 104,
          fontWeight: 600,
          letterSpacing: 2,
          color: verdictColor[receipt.verdict].ink,
        }}
      >
        {receipt.verdict}
      </div>
      <div
        style={{ marginTop: 14, fontSize: 28, lineHeight: 1.35, color: color.ink1, maxWidth: 960 }}
      >
        {receipt.comparison.public_explanation}
      </div>
    </OgFrame>,
    { ...size, fonts },
  )
}
