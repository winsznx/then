/**
 * Same claim, two reconstructions, one verdict. The blue line is the date cut: everything on the
 * right of it is read as Nansen recorded it on the claim date.
 */
export function MethodDiagram() {
  return (
    <figure className="rounded-lg border border-rule-strong bg-workspace px-4 py-6 md:px-8 md:py-10">
      <svg
        viewBox="0 0 720 400"
        role="img"
        aria-labelledby="method-diagram-title method-diagram-desc"
        className="mx-auto h-auto w-full max-w-[760px]"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        <title id="method-diagram-title">How THEN decides</title>
        <desc id="method-diagram-desc">
          One claim is reconstructed twice: with today&apos;s Smart Money labels and with the cohort
          Nansen recognized on the claim date. Comparing the two gives the verdict.
        </desc>
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M0 0 8 4 0 8z" fill="#121210" />
          </marker>
        </defs>

        <rect x="210" y="16" width="300" height="64" rx="8" fill="#FCFBF7" stroke="#121210" />
        <text
          x="360"
          y="42"
          textAnchor="middle"
          fontSize="13"
          fill="#6E6B63"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          same claim
        </text>
        <text x="360" y="64" textAnchor="middle" fontSize="16" fill="#121210">
          Smart Money bought $TOKEN on D
        </text>

        <path
          d="M300 80 190 150"
          stroke="#121210"
          strokeWidth="1.5"
          fill="none"
          markerEnd="url(#arrow)"
        />
        <path
          d="M420 80 530 150"
          stroke="#121210"
          strokeWidth="1.5"
          fill="none"
          markerEnd="url(#arrow)"
        />

        <rect x="40" y="152" width="280" height="104" rx="8" fill="#FCFBF7" stroke="#AAA398" />
        <text x="64" y="184" fontSize="16" fontWeight="600" fill="#121210">
          Today&apos;s labels
        </text>
        <text x="64" y="210" fontSize="14" fill="#3A3934">
          Wallets Smart Money today,
        </text>
        <text x="64" y="230" fontSize="14" fill="#3A3934">
          limited to activity on D
        </text>

        <rect x="400" y="152" width="280" height="104" rx="8" fill="#E9EEFF" stroke="#2F5EFF" />
        <text x="424" y="184" fontSize="16" fontWeight="600" fill="#2143C7">
          As of D
        </text>
        <text x="424" y="210" fontSize="14" fill="#2143C7">
          Wallets Nansen recognized
        </text>
        <text x="424" y="230" fontSize="14" fill="#2143C7">
          as Smart Money on D
        </text>

        <line x1="360" y1="120" x2="360" y2="290" stroke="#2F5EFF" strokeWidth="2" />
        <text
          x="368"
          y="136"
          fontSize="11"
          fill="#2F5EFF"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          date cut
        </text>

        <path
          d="M190 256 300 318"
          stroke="#121210"
          strokeWidth="1.5"
          fill="none"
          markerEnd="url(#arrow)"
        />
        <path
          d="M530 256 420 318"
          stroke="#121210"
          strokeWidth="1.5"
          fill="none"
          markerEnd="url(#arrow)"
        />

        <rect x="170" y="320" width="380" height="64" rx="8" fill="#121210" />
        <text
          x="360"
          y="346"
          textAnchor="middle"
          fontSize="13"
          fill="#D9D3C8"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          verdict
        </text>
        <text
          x="360"
          y="368"
          textAnchor="middle"
          fontSize="15"
          fontWeight="600"
          letterSpacing="0.04em"
          fill="#FFFFFF"
        >
          VALID · CONTAMINATED · INSUFFICIENT
        </text>
      </svg>
    </figure>
  )
}
