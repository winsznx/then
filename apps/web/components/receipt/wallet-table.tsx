import { shortAddress } from '@then/core'
import type { WalletRow } from '@then/engine'
import { usdCompact, usdFull } from '@/lib/format'

const BUCKET_TEXT: Record<WalletRow['bucket'], string> = {
  overlap: 'Both',
  live_only: "Today's labels only",
  asof_only: 'As-of only',
}

function tokens(value: number | null): string {
  return value === null ? '' : value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/** Shown only under recorded approval; the page decides whether it renders at all. */
export function WalletTable({ rows }: { rows: WalletRow[] }) {
  return (
    <div
      role="region"
      aria-label="Wallet-level diagnostics"
      tabIndex={0}
      className="overflow-x-auto"
    >
      <table className="t-ui w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="t-meta border-b border-rule-strong">
            <th scope="col" className="py-2 pr-4 font-normal">
              Wallet
            </th>
            <th scope="col" className="py-2 pr-4 font-normal">
              Counted by
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">
              Net tokens, today&apos;s labels
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">
              Net tokens, as of
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">
              Net USD
            </th>
            <th scope="col" className="py-2 pr-4 font-normal">
              Label today
            </th>
            <th scope="col" className="py-2 font-normal">
              Label at trade
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.wallet} className="border-b border-rule">
              <td className="py-2 pr-4">
                <span className="font-mono text-[12px] text-ink select-all" title={row.wallet}>
                  {shortAddress(row.wallet)}
                </span>
              </td>
              <td className="py-2 pr-4 text-ink-soft">{BUCKET_TEXT[row.bucket]}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{tokens(row.live_net_tokens)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{tokens(row.asof_net_tokens)}</td>
              <td
                className="py-2 pr-4 text-right tabular-nums"
                title={row.net_usd === null ? undefined : usdFull(row.net_usd)}
              >
                {row.net_usd === null ? '' : usdCompact(row.net_usd)}
              </td>
              <td className="py-2 pr-4 text-ink-soft">{row.live_label ?? ''}</td>
              <td className="py-2 text-ink-soft">{row.asof_label ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
