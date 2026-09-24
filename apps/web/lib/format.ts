import { CHAIN_DISPLAY, CLAIM_TYPE_DISPLAY, type Chain, type ClaimType } from '@then/core'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "12 Jun 2026" from an ISO date, without timezone surprises. */
export function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-')
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`
}

/** "12 Jun 2026, 14:05 UTC" */
export function formatStamp(iso: string): string {
  const date = new Date(iso)
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const mm = String(date.getUTCMinutes()).padStart(2, '0')
  return `${formatDay(date.toISOString())}, ${hh}:${mm} UTC`
}

export function chainName(chain: string): string {
  return CHAIN_DISPLAY[chain as Chain] ?? chain
}

export function claimTypeName(type: string): string {
  return CLAIM_TYPE_DISPLAY[type as ClaimType] ?? type
}

/** Compact USD for display; pair with the full value in a title attribute. */
export function usdCompact(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}k`
  return `${sign}$${Math.round(abs)}`
}

export function usdFull(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

export function shortId(value: string, head = 10, tail = 4): string {
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value
}

export function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}
