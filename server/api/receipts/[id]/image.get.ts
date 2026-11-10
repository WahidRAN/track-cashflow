import { and, eq } from 'drizzle-orm'
import { requireUserId } from '~/server/utils/auth'
import { useDb } from '~/server/utils/db'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { notFound, requireUuidParam } from '~/server/utils/request'
import { RECEIPTS_BUCKET, toStoragePath } from '~/server/utils/receiptDto'
import { receipts } from '~/db/schema'

const SERVABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/**
 * Streams a receipt's image from the private `receipts` bucket.
 * Used directly as <img src="/api/receipts/:id/image"> — the session cookie authenticates it.
 */
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const id = requireUuidParam(event)

  const [row] = await useDb()
    .select({ imageUrl: receipts.imageUrl })
    .from(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
  if (!row?.imageUrl) throw notFound('Image not found')

  const { data, error } = await useSupabaseAdmin().storage
    .from(RECEIPTS_BUCKET)
    .download(toStoragePath(row.imageUrl))
  if (error || !data) {
    console.warn(`[image] download failed for receipt ${id}:`, error?.message)
    throw notFound('Image not found')
  }

  const type = (data.type || '').split(';')[0]!.trim().toLowerCase()
  setResponseHeaders(event, {
    'content-type': SERVABLE_TYPES.has(type) ? type : 'image/jpeg',
    'cache-control': 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
  })
  return Buffer.from(await data.arrayBuffer())
})
