import type { H3Event } from 'h3'
import { parseRangeBound } from '~/server/utils/datetime'

// Request parsing / validation helpers shared by API routes.

/** NUMERIC(10,2) money columns */
export const MAX_MONEY = 99_999_999.99
/** NUMERIC(6,2) quantity column */
export const MAX_QUANTITY = 9_999.99

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function badRequest(message: string) {
  return createError({ statusCode: 400, statusMessage: 'Bad Request', message })
}

export function notFound(message: string) {
  return createError({ statusCode: 404, statusMessage: 'Not Found', message })
}

/** Route param that must be a UUID — anything else can't exist, so 404 (not a Postgres cast error) */
export function requireUuidParam(event: H3Event, name = 'id'): string {
  const value = getRouterParam(event, name)
  if (!isUuid(value)) throw notFound('Not found')
  return value.toLowerCase()
}

export type JsonObject = Record<string, unknown>

export async function readJsonObject(event: H3Event): Promise<JsonObject> {
  let body: unknown
  try {
    body = await readBody(event)
  }
  catch {
    throw badRequest('Invalid JSON body')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Expected a JSON object body')
  return body as JsonObject
}

/**
 * Optional string field. undefined = not sent; null = cleared (only when
 * `nullable`, an empty string also clears). Trimmed.
 */
export function readStringField(
  body: JsonObject,
  key: string,
  opts: { nullable?: boolean, maxLength?: number } = {},
): string | null | undefined {
  const value = body[key]
  if (value === undefined) return undefined
  if (value === null || (typeof value === 'string' && !value.trim())) {
    if (opts.nullable) return null
    throw badRequest(`${key} must not be empty`)
  }
  if (typeof value !== 'string') throw badRequest(`${key} must be a string`)
  const s = value.trim()
  if (opts.maxLength && s.length > opts.maxLength) throw badRequest(`${key} is too long (max ${opts.maxLength})`)
  return s
}

/**
 * Optional numeric field (numbers or numeric strings). undefined = not sent;
 * null = cleared (only when `nullable`; '' from an emptied <input> also clears).
 */
export function readNumberField(
  body: JsonObject,
  key: string,
  opts: { nullable?: boolean, min?: number, max?: number } = {},
): number | null | undefined {
  const value = body[key]
  if (value === undefined) return undefined
  if (value === null || value === '') {
    if (opts.nullable) return null
    throw badRequest(`${key} is required`)
  }
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(n)) throw badRequest(`${key} must be a number`)
  if (opts.min !== undefined && n < opts.min) throw badRequest(`${key} must be at least ${opts.min}`)
  if (opts.max !== undefined && n > opts.max) throw badRequest(`${key} must be at most ${opts.max}`)
  return n
}

/** Integer query param clamped to [min, max]; falls back on anything unparsable */
export function readIntQuery(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(Array.isArray(value) ? value[0] : value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/**
 * `from` / `to` query params as [from, toExclusive). Date-only values
 * ("2025-01-31") cover the whole local day in `tz`. 400 on invalid input.
 */
export function readDateRangeQuery(event: H3Event, tz: string): { from?: Date, toExclusive?: Date } {
  const query = getQuery(event)
  const from = parseRangeBound(query.from, tz, 'from')
  const toExclusive = parseRangeBound(query.to, tz, 'to')
  if (from === null) throw badRequest('Invalid "from" date')
  if (toExclusive === null) throw badRequest('Invalid "to" date')
  return { from, toExclusive }
}

/** Escape LIKE/ILIKE wildcards so user input matches literally */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, ch => `\\${ch}`)
}

/** Postgres error code from a postgres-js error, possibly wrapped by Drizzle (DrizzleQueryError.cause) */
export function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: unknown, cause?: { code?: unknown } } | null
  const code = e?.code ?? e?.cause?.code
  return typeof code === 'string' ? code : undefined
}
