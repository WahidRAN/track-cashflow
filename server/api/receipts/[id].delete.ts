import { serverSupabaseUser } from '#supabase/server'
import { useDb } from '~/server/utils/db'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { receipts } from '~/db/schema'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const id = getRouterParam(event, 'id')!
  const db = useDb()
  const supabaseAdmin = useSupabaseAdmin()

  const receiptRows = await db.select().from(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.userId, user.id)))
  const receipt = receiptRows[0]

  if (!receipt) throw createError({ statusCode: 404, message: 'Receipt not found' })

  // Delete from storage if image exists
  if (receipt.imageUrl) {
    const path = `${user.id}/${id}`
    await supabaseAdmin.storage.from('receipts').remove([`${path}/original.jpg`])
  }

  await db.delete(receipts).where(and(eq(receipts.id, id), eq(receipts.userId, user.id)))

  return { success: true }
})
