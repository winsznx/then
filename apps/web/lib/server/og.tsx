import 'server-only'
import { color } from '@then/ui'
import { log } from './nansen'

type FontSpec = { name: string; data: ArrayBuffer; weight: 400 | 600; style: 'normal' }

const FAMILIES = 'family=Instrument+Serif&family=Geist:wght@400;600&family=IBM+Plex+Mono:wght@400'

let fonts: Promise<FontSpec[]> | undefined

async function loadFonts(): Promise<FontSpec[]> {
  const css = await (
    await fetch(`https://fonts.googleapis.com/css2?${FAMILIES}`, {
      signal: AbortSignal.timeout(5000),
    })
  ).text()
  const faces = [
    ...css.matchAll(
      /font-family: '([^']+)';[^}]*?font-weight: (\d+);[^}]*?src: url\(([^)]+)\) format\('truetype'\)/g,
    ),
  ]
  if (faces.length === 0) throw new Error('no truetype faces in the font stylesheet')
  return Promise.all(
    faces.map(async ([, name, weight, url]) => ({
      name: name!,
      weight: (Number(weight) >= 600 ? 600 : 400) as 400 | 600,
      style: 'normal' as const,
      data: await (await fetch(url!, { signal: AbortSignal.timeout(5000) })).arrayBuffer(),
    })),
  )
}

/**
 * Brand fonts for generated images, fetched once per process from Google Fonts (TrueType, which
 * the image renderer needs). If that fails the image still renders in the renderer's own font.
 */
export function ogFonts(): Promise<FontSpec[]> {
  fonts ??= loadFonts().catch((error: unknown) => {
    log('warn', {
      event: 'og.fonts_unavailable',
      error: error instanceof Error ? error.message : String(error),
    })
    fonts = undefined
    return []
  })
  return fonts
}

export const OG_SIZE = { width: 1200, height: 630 }

/** Page frame shared by every generated card: paper, a date cut on the left, attribution at the foot. */
export function OgFrame({ children, footer }: { children: React.ReactNode; footer: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: color.paper0,
        fontFamily: 'Geist',
        color: color.ink0,
      }}
    >
      <div style={{ width: 4, height: '100%', background: color.timeBlue, marginLeft: 64 }} />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '56px 72px 48px 56px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <OgWordmark />
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 20, color: color.ink2 }}>
            Was this Smart Money then?
          </div>
        </div>
        <div
          style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
        >
          {children}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: 'IBM Plex Mono',
            fontSize: 20,
            color: color.ink2,
          }}
        >
          <div>{footer}</div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                background: color.nansen,
                marginRight: 10,
              }}
            />
            Powered by Nansen API
          </div>
        </div>
      </div>
    </div>
  )
}

function OgWordmark() {
  return (
    <svg width="132" height="50" viewBox="0 0 330 124">
      <g fill={color.ink0}>
        <rect x="0" y="12" width="70" height="14" />
        <rect x="28" y="12" width="14" height="100" />
        <rect x="88" y="12" width="14" height="100" />
        <rect x="154" y="12" width="14" height="100" />
        <rect x="102" y="55" width="25" height="14" />
        <rect x="129" y="58" width="25" height="14" />
        <rect x="186" y="12" width="14" height="100" />
        <rect x="186" y="12" width="56" height="14" />
        <rect x="186" y="55" width="48" height="14" />
        <rect x="186" y="98" width="56" height="14" />
        <rect x="258" y="12" width="14" height="100" />
        <rect x="316" y="12" width="14" height="100" />
        <polygon points="258,12 272,12 330,112 316,112" />
      </g>
      <rect x="127" y="0" width="2" height="124" fill={color.timeBlue} />
    </svg>
  )
}
