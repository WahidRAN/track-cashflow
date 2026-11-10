import type { H3Event } from 'h3'
import { getHeader } from 'h3'

// Timezone handling.
//
// Receipts print local wall-clock time with no offset ("2025/01/05 14:32"), and
// JS/Postgres would otherwise read that as UTC — showing a Tokyo receipt 9h off
// in the browser. Naive times are therefore interpreted in the household's
// timezone: `x-timezone` request header (IANA name, e.g. sent by the client
// from Intl.DateTimeFormat().resolvedOptions().timeZone) → runtimeConfig
// public.timezone (if configured) → DEFAULT_TIMEZONE.

export const DEFAULT_TIMEZONE = 'Asia/Tokyo'

export interface WallTime {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  second: number
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  }
  catch {
    return false
  }
}

export function resolveTimezone(event: H3Event): string {
  const header = getHeader(event, 'x-timezone')?.trim()
  if (isValidTimeZone(header)) return header
  const configured = (useRuntimeConfig(event).public as Record<string, unknown>).timezone
  if (isValidTimeZone(configured)) return configured
  return DEFAULT_TIMEZONE
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(tz, f)
  }
  return f
}

/** Wall-clock time of an instant in a timezone */
export function getWallTime(date: Date, tz: string): WallTime {
  const parts = formatterFor(tz).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

function offsetMs(utcMs: number, tz: string): number {
  const w = getWallTime(new Date(utcMs), tz)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/** The instant at which the clock in `tz` shows the given wall time */
export function zonedWallTimeToUtc(w: WallTime, tz: string): Date {
  // Date.UTC normalizes overflow (e.g. month 13 → January next year)
  const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  const first = offsetMs(guess, tz)
  let ts = guess - first
  const second = offsetMs(ts, tz)
  if (second !== first) ts = guess - second // DST transition between guess and result
  return new Date(ts)
}

/** First instant of the month containing `date` in `tz`, shifted by `monthOffset` months */
export function startOfMonthInZone(date: Date, tz: string, monthOffset = 0): Date {
  const w = getWallTime(date, tz)
  return zonedWallTimeToUtc({ year: w.year, month: w.month + monthOffset, day: 1, hour: 0, minute: 0, second: 0 }, tz)
}

/** "YYYY-MM-DD" of `date` in `tz` */
export function formatDateInZone(date: Date, tz: string): string {
  const w = getWallTime(date, tz)
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`
}

// "2025-01-05", "2025-01-05T14:32:00", "2025/1/5 14:32", "2025年1月5日(日) 14時32分"
// (the optional 日 must not swallow the space before the time, hence (?:\s*日)?)
const WALL_TIME_RE = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})(?:\s*日)?(?:(?:\s*T\s*|\s*\(.{1,3}\)\s*|\s+)(\d{1,2})\s*[:時]\s*(\d{1,2})(?:\s*[:分]\s*(\d{1,2}))?)?/i
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/
// Time followed by an explicit UTC offset ("…14:32:00Z", "…14:32+09:00")
const EXPLICIT_OFFSET_RE = /\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:z|[+-]\d{2}(?::?\d{2})?)$/i

export function parseWallTime(value: string): WallTime | null {
  const m = WALL_TIME_RE.exec(value.normalize('NFKC').trim())
  if (!m) return null
  const w: WallTime = {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: m[4] ? Number(m[4]) : 0,
    minute: m[5] ? Number(m[5]) : 0,
    second: m[6] ? Number(m[6]) : 0,
  }
  if (w.month < 1 || w.month > 12 || w.day < 1 || w.day > 31 || w.hour > 23 || w.minute > 59 || w.second > 59) {
    return null
  }
  return w
}

/**
 * Parse a datetime string, reading naive (offset-less) values as wall time in `tz`.
 * With `ignoreOffset` an explicit offset is discarded too — used for AI output,
 * where any offset is invented (the receipt only shows local time).
 */
export function parseDateTimeInZone(value: string, tz: string, opts: { ignoreOffset?: boolean } = {}): Date | null {
  const s = value.normalize('NFKC').trim()
  if (!s) return null

  if (!opts.ignoreOffset && EXPLICIT_OFFSET_RE.test(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const w = parseWallTime(s)
  if (w) return zonedWallTimeToUtc(w, tz)

  // Free-form ("Jan 5, 2025 2:32 PM"): JS parses it in server-local time, so
  // its local components are the wall time as written.
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return zonedWallTimeToUtc({
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
    second: d.getSeconds(),
  }, tz)
}

/**
 * Parse a `from` / `to` query bound. A date-only value ("2025-01-31") covers
 * that whole local day; a full datetime is used as-is. Returns an inclusive
 * lower bound for `from` and an EXCLUSIVE upper bound for `to`.
 * undefined = not given, null = invalid.
 */
export function parseRangeBound(value: unknown, tz: string, edge: 'from' | 'to'): Date | null | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') return null
  const s = value.trim()

  if (DATE_ONLY_RE.test(s)) {
    const w = parseWallTime(s)
    if (!w) return null
    return zonedWallTimeToUtc(edge === 'to' ? { ...w, day: w.day + 1 } : w, tz)
  }

  const d = parseDateTimeInZone(s, tz)
  if (!d) return null
  return edge === 'to' ? new Date(d.getTime() + 1) : d
}
