import type { H3Event } from 'h3'
import { serverSupabaseUser } from '#supabase/server'

/**
 * The signed-in user's id, or a 401.
 *
 * `serverSupabaseUser()` in @nuxtjs/supabase 2.x returns the JWT *claims*
 * (via `auth.getClaims()`), not a User object — the id is `claims.sub`, and
 * `.id` is undefined. It also throws a 500 for an invalid/expired token, which
 * is really an auth failure. Always use this helper in API routes.
 */
export async function requireUserId(event: H3Event): Promise<string> {
  const cached = event.context.userId
  if (typeof cached === 'string') return cached

  let sub: unknown
  try {
    const claims = await serverSupabaseUser(event)
    sub = claims?.sub
  }
  catch (err: any) {
    console.warn('[auth] session check failed:', err?.statusMessage || err?.message || err)
  }

  if (typeof sub !== 'string' || !sub) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Not signed in' })
  }
  event.context.userId = sub
  return sub
}
