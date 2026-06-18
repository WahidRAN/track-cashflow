import { serverSupabaseUser } from '#supabase/server'
import { useDb } from '~/server/utils/db'
import { receipts } from '~/db/schema'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = useDb()

  const [existing] = await db.select().from(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.userId, user.id)))

  if (!existing) throw createError({ statusCode: 404, message: 'Receipt not found' })

  await db.update(receipts).set({
    ...(body.storeName !== undefined && { storeName: body.storeName }),
    ...(body.storeAddress !== undefined && { storeAddress: body.storeAddress }),
    ...(body.receiptDatetime !== undefined && { receiptDatetime: new Date(body.receiptDatetime) }),
    ...(body.subtotal !== undefined && { subtotal: body.subtotal?.toString() ?? null }),
    ...(body.taxTotal !== undefined && { taxTotal: body.taxTotal?.toString() ?? null }),
    ...(body.total !== undefined && { total: body.total.toString() }),
  }).where(and(eq(receipts.id, id), eq(receipts.userId, user.id)))

  const [updated] = await db.select().from(receipts).where(eq(receipts.id, id))

  if (!updated) throw createError({ statusCode: 500, message: 'Failed to retrieve updated receipt' })

  return {
    ...updated,
    receiptDatetime: updated.receiptDatetime.toISOString(),
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    subtotal: updated.subtotal ? Number(updated.subtotal) : null,
    taxTotal: updated.taxTotal ? Number(updated.taxTotal) : null,
    total: Number(updated.total),
  }
})
