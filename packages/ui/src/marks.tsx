import type { SVGProps } from 'react'
import { color } from './tokens'

interface MarkProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Ink for the letterforms; the cut stays temporal blue unless `mono` is set. */
  ink?: string
  mono?: boolean
  title?: string
}

/**
 * THEN wordmark. Geometric caps built from rectangles on a 100-unit cap height, 14-unit stroke.
 * A blue date cut runs through the H; the right half of its crossbar sits 3 units lower, the same
 * bar read at two points in time.
 */
export function Wordmark({ ink = color.ink0, mono = false, title = 'THEN', ...props }: MarkProps) {
  const cut = mono ? ink : color.timeBlue
  return (
    <svg viewBox="0 0 330 124" role="img" aria-label={title} {...props}>
      <title>{title}</title>
      <g fill={ink}>
        {/* T */}
        <rect x="0" y="12" width="70" height="14" />
        <rect x="28" y="12" width="14" height="100" />
        {/* H: stems, then the crossbar split by the cut */}
        <rect x="88" y="12" width="14" height="100" />
        <rect x="154" y="12" width="14" height="100" />
        <rect x="102" y="55" width="25" height="14" />
        <rect x="129" y="58" width="25" height="14" />
        {/* E */}
        <rect x="186" y="12" width="14" height="100" />
        <rect x="186" y="12" width="56" height="14" />
        <rect x="186" y="55" width="48" height="14" />
        <rect x="186" y="98" width="56" height="14" />
        {/* N */}
        <rect x="258" y="12" width="14" height="100" />
        <rect x="316" y="12" width="14" height="100" />
        <polygon points="258,12 272,12 330,112 316,112" />
      </g>
      <rect x="127" y="0" width="2" height="124" fill={cut} />
    </svg>
  )
}

/**
 * Date Cut micro mark: two ledger lines, one vertical cut, and a marker that sits on the lower
 * line before the cut and on the upper line after it. Membership changes; the timeline does not.
 */
export function DateCutMark({ ink = color.ink0, mono = false, title = 'THEN', ...props }: MarkProps) {
  const cut = mono ? ink : color.timeBlue
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={title} {...props}>
      <title>{title}</title>
      <g stroke={ink} strokeWidth="1.5" strokeLinecap="square" fill="none">
        <line x1="3" y1="8" x2="21" y2="8" />
        <line x1="3" y1="16" x2="21" y2="16" />
      </g>
      <rect x="5" y="14" width="4" height="4" fill={ink} />
      <rect x="15" y="6" width="4" height="4" fill={ink} />
      <line x1="12" y1="2.5" x2="12" y2="21.5" stroke={cut} strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  )
}
