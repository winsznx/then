import { color } from '@then/ui'
import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/** The Date Cut mark on paper: two ledger lines, a marker that changes line, and the blue cut. */
export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', background: color.paper0 }}>
      <svg width="180" height="180" viewBox="0 0 24 24">
        <g stroke={color.ink0} strokeWidth="1.2" fill="none">
          <line x1="4" y1="8.5" x2="20" y2="8.5" />
          <line x1="4" y1="15.5" x2="20" y2="15.5" />
        </g>
        <rect x="6" y="13.5" width="4" height="4" fill={color.ink0} />
        <rect x="14" y="6.5" width="4" height="4" fill={color.ink0} />
        <line x1="12" y1="3.5" x2="12" y2="20.5" stroke={color.timeBlue} strokeWidth="1.2" />
      </svg>
    </div>,
    size,
  )
}
