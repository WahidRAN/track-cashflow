/**
 * Locale/currency-aware formatting for the UI.
 *
 * Driven by `runtimeConfig.public.currency` (ISO 4217, default 'JPY') and
 * `runtimeConfig.public.locale` (BCP 47, default 'en-US'). `Intl` knows each
 * currency's minor units, so JPY renders with 0 decimals and USD with 2.
 *
 * `runtimeConfig.public.timezone` (IANA, default 'Asia/Tokyo') pins date output
 * to the household's time zone so SSR (UTC on Vercel) and the browser render
 * the same text. If unset/invalid, the runtime's local time zone is used.
 */

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

type DateInput = string | number | Date | null | undefined

// Intl constructors are comparatively expensive; config is app-wide, so cache by key.
const formatterCache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>()

function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat>(key: string, create: () => T): T {
  let f = formatterCache.get(key) as T | undefined
  if (!f) {
    f = create()
    formatterCache.set(key, f)
  }
  return f
}

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function useFormat() {
  const config = useRuntimeConfig().public
  const currency = (config.currency as string | undefined) || 'JPY'
  const locale = (config.locale as string | undefined) || 'en-US'
  // `timezone` is the key nuxt.config.ts defines (shared with the server's receipt-time parsing)
  const tz = (config as Record<string, unknown>).timezone ?? (config as Record<string, unknown>).timeZone
  const timeZone = typeof tz === 'string' && tz && isValidTimeZone(tz) ? tz : undefined

  const currencyFormatter = cached(`cur|${locale}|${currency}`, () =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }),
  ) as Intl.NumberFormat

  /** Minor units for the currency (JPY → 0, USD → 2). */
  const currencyFractionDigits = currencyFormatter.resolvedOptions().maximumFractionDigits ?? 2

  /** `step` attribute for money inputs: "1" for JPY, "0.01" for USD/EUR, … */
  const amountStep = currencyFractionDigits === 0 ? '1' : (1 / 10 ** currencyFractionDigits).toFixed(currencyFractionDigits)

  /** Placeholder for empty money inputs ("0" for JPY, "0.00" for USD). */
  const amountPlaceholder = (0).toFixed(currencyFractionDigits)

  function formatCurrency(amount: number | null | undefined): string {
    if (amount === null || amount === undefined || Number.isNaN(amount)) return '-'
    return currencyFormatter.format(amount)
  }

  /** Round to the currency's minor units (avoids 1.1 * 3 = 3.3000000000000003, or ¥0.5). */
  function roundCurrency(amount: number): number {
    const factor = 10 ** currencyFractionDigits
    return Math.round(amount * factor) / factor
  }

  function formatDate(value: DateInput, options: Intl.DateTimeFormatOptions): string {
    const d = toDate(value)
    if (!d) return '-'
    const key = `dt|${locale}|${timeZone ?? ''}|${JSON.stringify(options)}`
    const f = cached(key, () => new Intl.DateTimeFormat(locale, { ...options, timeZone })) as Intl.DateTimeFormat
    return f.format(d)
  }

  /** "Jun 15, 3:45 PM" — list rows. */
  const formatDateTime = (value: DateInput) =>
    formatDate(value, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  /** "Sat, Jun 15, 3:45 PM" — receipt detail header. */
  const formatFullDateTime = (value: DateInput) =>
    formatDate(value, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  /** "3:45 PM" */
  const formatTime = (value: DateInput) =>
    formatDate(value, { hour: 'numeric', minute: '2-digit' })

  /** "June 2026" */
  const formatMonthYear = (value: DateInput) =>
    formatDate(value, { month: 'long', year: 'numeric' })

  /** "June 15" or "June 15, 2024" */
  const formatDayLabel = (value: DateInput, withYear = false) =>
    formatDate(value, { month: 'long', day: 'numeric', ...(withYear && { year: 'numeric' }) })

  /** Calendar parts of a date in the configured time zone (month is 1-12). */
  function dateParts(value: DateInput): { year: number, month: number, day: number } | null {
    const d = toDate(value)
    if (!d) return null
    const f = cached(`parts|${timeZone ?? ''}`, () =>
      new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }),
    ) as Intl.DateTimeFormat
    const parts = Object.fromEntries(f.formatToParts(d).map(p => [p.type, p.value]))
    return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) }
  }

  /** Stable "YYYY-MM-DD" key in the configured time zone (for grouping by day). */
  function dayKey(value: DateInput): string {
    const p = dateParts(value)
    if (!p) return ''
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
  }

  return {
    currency,
    locale,
    timeZone,
    currencyFractionDigits,
    amountStep,
    amountPlaceholder,
    formatCurrency,
    roundCurrency,
    formatDate,
    formatDateTime,
    formatFullDateTime,
    formatTime,
    formatMonthYear,
    formatDayLabel,
    dateParts,
    dayKey,
  }
}
