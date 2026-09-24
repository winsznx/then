const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

export type Clock = () => Date

export const systemClock: Clock = () => new Date()

/** True for a real Gregorian calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function utcToday(clock: Clock = systemClock): string {
  return toIsoDate(clock())
}

export function addDays(isoDate: string, days: number): string {
  return toIsoDate(new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS))
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/** Inclusive list of UTC days from `from` to `to`. */
export function dateRange(from: string, to: string): string[] {
  const days: string[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day)
  return days
}

export interface ClaimWindow {
  from: string
  to: string
  days: number
}

/** A claim window always ends on the claim date, so no request can look past the cutoff. */
export function claimWindow(asOfDate: string, windowHours: number): ClaimWindow {
  const days = windowHours / 24
  return { from: addDays(asOfDate, -(days - 1)), to: asOfDate, days }
}

/**
 * The current UTC day has no settled snapshot. The previous day is served fresh until it settles
 * (about two days after close), so it is usable but marked recent.
 */
export type Settlement = 'unsettled' | 'recent' | 'settled'

export const RECENT_WINDOW_DAYS = 2

export function settlementOf(asOfDate: string, clock: Clock = systemClock): Settlement {
  const today = utcToday(clock)
  if (asOfDate >= today) return 'unsettled'
  return daysBetween(asOfDate, today) <= RECENT_WINDOW_DAYS ? 'recent' : 'settled'
}

export function lastSettledDay(clock: Clock = systemClock): string {
  return addDays(utcToday(clock), -1)
}
