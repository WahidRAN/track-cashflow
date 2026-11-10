import { and, eq } from 'drizzle-orm'
import { requireUserId } from '~/server/utils/auth'
import { useDb } from '~/server/utils/db'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { notFound, requireUuidParam } from '~/server/utils/request'
import { RECEIPTS_BUCKET, toStoragePath } from '~/server/utils/receiptDto'
import { receipts } from '~/db/schema'

export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const id = requireUuidParam(event)

  // Items are removed by ON DELETE CASCADE
  const [deleted] = await useDb()
    .delete(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
    .returning({ imageUrl: receipts.imageUrl })
  if (!deleted) throw notFound('Receipt not found')

  if (deleted.imageUrl) {
    const { error } = await useSupabaseAdmin().storage
      .from(RECEIPTS_BUCKET)
      .remove([toStoragePath(deleted.imageUrl)])
    if (error) console.warn(`[delete] could not remove image for receipt ${id}:`, error.message)
  }

  return { success: true }
})
