import type { PublicCorpusRow } from '@then/corpus'
import type { Verdict } from '@then/core'
import Link from 'next/link'
import { VerdictWord } from '@/components/verdict/verdict'
import { chainName, claimTypeName, formatDay } from '@/lib/format'

const ROLE_TEXT: Record<string, string> = {
  general: 'General',
  control: 'Control',
  later_drawdown: 'Later drawdown',
}

const NOT_RUN_TEXT: Record<string, string> = {
  BUDGET: 'Not run: credit budget',
  UNSUPPORTED_CHAIN: 'Not run: chain not covered',
  UNSUPPORTED_CLAIM_TYPE: 'Not run: no dated surface',
}

function sourceHost(url: string): string {
  return URL.canParse(url) ? new URL(url).hostname.replace(/^www\./, '') : 'source'
}

function forward(row: PublicCorpusRow): string {
  if (row.status !== 'stamped') return ''
  if (row.forward_return_7d === null) return 'Not settled'
  const pct = row.forward_return_7d * 100
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toFixed(1)}%`
}

/**
 * Every frozen claim in file order, stamped or not. Verdict color appears only in the verdict
 * cell; nothing else in the table is tinted by outcome.
 */
export function CorpusTable({ rows, caption }: { rows: PublicCorpusRow[]; caption: string }) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-rule-strong bg-workspace"
    >
      <table className="w-full min-w-[1120px] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="t-meta border-b border-rule-strong">
            <th scope="col" className="px-4 py-3 font-normal">
              Claim
            </th>
            <th scope="col" className="px-4 py-3 font-normal">
              Token · chain
            </th>
            <th scope="col" className="px-4 py-3 font-normal">
              Date (UTC)
            </th>
            <th scope="col" className="px-4 py-3 font-normal">
              Claim type
            </th>
            <th scope="col" className="px-4 py-3 font-normal">
              Role
            </th>
            <th scope="col" className="px-4 py-3 font-normal">
              Today&apos;s labels
            </th>
            <th scope="col" className="px-4 py-3 font-normal">
              As of date
            </th>
            <th scope="col" className="px-4 py-3 font-normal">
              Verdict
            </th>
            <th scope="col" className="px-4 py-3 text-right font-normal">
              7D after
            </th>
            <th scope="col" className="px-4 py-3 font-normal">
              Receipt
            </th>
          </tr>
        </thead>
        <tbody className="t-ui">
          {rows.map((row) => (
            <tr key={row.claim_id} className="border-b border-rule align-top last:border-b-0">
              <td className="px-4 py-3">
                <span className="t-meta block text-ink">{row.claim_id}</span>
                <a
                  href={row.source_url}
                  rel="noreferrer nofollow"
                  title={row.quote}
                  className="text-ink-soft underline decoration-rule-strong underline-offset-4 hover:text-ink"
                >
                  {sourceHost(row.source_url)}
                </a>
              </td>
              <td className="px-4 py-3 text-ink">
                ${row.token_symbol}
                <span className="block text-ink-soft">{chainName(row.chain)}</span>
              </td>
              <td className="t-meta px-4 py-3 text-ink">
                {formatDay(row.as_of_date)}
                {row.window_hours > 24 ? (
                  <span className="block">{row.window_hours / 24}-day window</span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-ink-soft">{claimTypeName(row.claim_type)}</td>
              <td className="px-4 py-3 text-ink-soft">
                {ROLE_TEXT[row.selection_role] ?? row.selection_role}
              </td>
              <td className="t-meta px-4 py-3 text-ink">
                {row.status === 'stamped' ? row.live_support : ''}
              </td>
              <td className="t-meta px-4 py-3 text-time-deep">
                {row.status === 'stamped' ? row.asof_support : ''}
              </td>
              <td className="px-4 py-3">
                {row.verdict ? (
                  <VerdictWord verdict={row.verdict as Verdict} className="text-[13px]" />
                ) : (
                  <span className="text-ink-soft">
                    {NOT_RUN_TEXT[row.not_run_reason ?? ''] ??
                      `Not run: ${row.not_run_reason ?? 'unknown'}`}
                  </span>
                )}
              </td>
              <td className="t-meta px-4 py-3 text-right text-ink tabular-nums">{forward(row)}</td>
              <td className="px-4 py-3">
                {row.receipt_id ? (
                  <Link
                    href={`/r/${row.receipt_id}`}
                    className="t-meta text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                  >
                    {row.receipt_id.slice(0, 12)}…
                  </Link>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
