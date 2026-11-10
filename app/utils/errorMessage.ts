/**
 * Turn a thrown `$fetch`/`useFetch` error into something a person can read.
 *
 * Server routes throw `createError({ statusCode, message })`, which arrives as
 * `FetchError.data.message`. The raw `FetchError.message` looks like
 * `[POST] "/api/receipts": 500 Internal Server Error`, so prefer the payload.
 */
export function getErrorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (!e || typeof e !== 'object') return typeof e === 'string' && e ? e : fallback
  const err = e as {
    data?: { message?: unknown, statusMessage?: unknown } | null
    statusMessage?: unknown
    message?: unknown
  }
  const candidates = [err.data?.message, err.data?.statusMessage, err.statusMessage, err.message]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c
  }
  return fallback
}
