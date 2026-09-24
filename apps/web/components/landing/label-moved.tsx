import { color } from '@then/ui'

/**
 * One wallet, one trade, two readings. Before the cut the wallet sits on the lower ledger line
 * (not Smart Money when it traded); today it sits on the upper line. The trade stays where it was.
 */
export function LabelMoved() {
  return (
    <section
      aria-labelledby="label-moved-heading"
      className="bg-band pt-[calc(12rem+var(--section-gap-lg)/2)] pb-[calc(var(--section-gap-lg)/2)]"
    >
      <div className="page grid gap-12 lg:grid-cols-12 lg:gap-6">
        <h2 id="label-moved-heading" className="t-h2 lg:col-span-6">
          <span className="block">The label moved.</span>
          <span className="block">The transaction didn&apos;t.</span>
        </h2>
        <div className="t-lead space-y-4 lg:col-span-5 lg:col-start-8 lg:pt-3">
          <p>
            A wallet can qualify as Smart Money today without having qualified when an old trade
            happened.
          </p>
          <p>
            THEN tests the historical claim at the historical cutoff, instead of assuming the label
            was always there.
          </p>
        </div>
      </div>
      <div className="page mt-12 md:hidden">
        <svg viewBox="0 0 360 270" className="h-auto w-full" aria-hidden="true">
          <line x1="0" y1="100" x2="360" y2="100" stroke={color.lineStrong} strokeWidth="1" />
          <line x1="0" y1="190" x2="360" y2="190" stroke={color.lineStrong} strokeWidth="1" />
          <text
            x="0"
            y="90"
            fontSize="12"
            fill={color.ink2}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Smart Money
          </text>
          <text
            x="0"
            y="180"
            fontSize="12"
            fill={color.ink2}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            not Smart Money
          </text>
          <rect x="92" y="182" width="16" height="16" fill={color.ink0} />
          <text
            x="60"
            y="222"
            fontSize="13"
            fill={color.ink1}
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Buys on D
          </text>
          <line x1="190" y1="20" x2="190" y2="262" stroke={color.timeBlue} strokeWidth="2" />
          <text
            x="198"
            y="34"
            fontSize="12"
            fill={color.timeBlue}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            end of D, UTC
          </text>
          <path
            d="M108 190 C 160 190, 220 100, 282 100"
            stroke={color.ink2}
            strokeWidth="1"
            strokeDasharray="4 5"
            fill="none"
          />
          <rect
            className="label-moved-marker"
            x="282"
            y="92"
            width="16"
            height="16"
            fill={color.ink0}
          />
          <text
            x="358"
            y="134"
            textAnchor="end"
            fontSize="13"
            fill={color.ink1}
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Labeled today
          </text>
        </svg>
      </div>
      <div className="mt-12 hidden overflow-hidden md:mt-16 md:block">
        <svg
          viewBox="0 0 1200 240"
          preserveAspectRatio="xMidYMid meet"
          className="h-auto w-full"
          aria-hidden="true"
        >
          <line x1="0" y1="80" x2="1200" y2="80" stroke={color.lineStrong} strokeWidth="1" />
          <line x1="0" y1="170" x2="1200" y2="170" stroke={color.lineStrong} strokeWidth="1" />
          <text
            x="24"
            y="68"
            fontSize="13"
            fill={color.ink2}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Smart Money
          </text>
          <text
            x="24"
            y="158"
            fontSize="13"
            fill={color.ink2}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            not Smart Money
          </text>

          <line x1="380" y1="150" x2="380" y2="190" stroke={color.ink0} strokeWidth="1.5" />
          <rect x="370" y="160" width="20" height="20" fill={color.ink0} />
          <text
            x="410"
            y="214"
            fontSize="14"
            fill={color.ink1}
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            The wallet buys on D
          </text>

          <line x1="600" y1="16" x2="600" y2="232" stroke={color.timeBlue} strokeWidth="2" />
          <text
            x="612"
            y="30"
            fontSize="13"
            fill={color.timeBlue}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            end of D, UTC
          </text>

          <path
            d="M390 170 C 560 170, 700 80, 860 80"
            stroke={color.ink2}
            strokeWidth="1"
            strokeDasharray="4 5"
            fill="none"
          />
          <rect
            className="label-moved-marker"
            x="850"
            y="70"
            width="20"
            height="20"
            fill={color.ink0}
          />
          <text
            x="890"
            y="56"
            fontSize="14"
            fill={color.ink1}
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            The same wallet carries the label today
          </text>
        </svg>
      </div>
    </section>
  )
}
