import { color } from '@then/ui'
import { ImageResponse } from 'next/og'
import { connection } from 'next/server'
import { env } from '@/lib/server/env'
import { loadCorpusView } from '@/lib/server/corpus'
import { OG_SIZE, OgFrame, ogFonts } from '@/lib/server/og'

export const alt = 'THEN evidence: measured corpus results with their denominators'
export const size = OG_SIZE
export const contentType = 'image/png'

/** Measured numbers only, each with its denominator; nothing when no run is published. */
export default async function Image() {
  await connection()
  const run = (await loadCorpusView()).runs[0]
  const stats = run
    ? [
        [`${run.summary.claims_stamped}/${run.summary.claims_tested}`, 'claims stamped'],
        [`${run.summary.drift_25pct}/${run.summary.complete_dual}`, 'sides 25%+ apart'],
        [
          `${run.summary.support_disagreements}/${run.summary.complete_dual}`,
          'disagree on support',
        ],
      ]
    : []
  return new ImageResponse(
    <OgFrame footer={`${env.publicBaseUrl.replace(/^https?:\/\//, '')}/corpus`}>
      <div style={{ fontFamily: 'Instrument Serif', fontSize: 76, lineHeight: 1 }}>
        Did the two clocks disagree?
      </div>
      {stats.length > 0 ? (
        <div style={{ display: 'flex', marginTop: 44 }}>
          {stats.map(([value, label]) => (
            <div
              key={label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                marginRight: 64,
                borderTop: `2px solid ${color.lineStrong}`,
                paddingTop: 14,
              }}
            >
              <div style={{ fontFamily: 'Instrument Serif', fontSize: 72, lineHeight: 1 }}>
                {value}
              </div>
              <div style={{ fontSize: 24, color: color.ink1, marginTop: 8 }}>{label}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 32, fontSize: 30, color: color.ink1 }}>
          Frozen corpus: not yet run.
        </div>
      )}
    </OgFrame>,
    { ...size, fonts: await ogFonts() },
  )
}
