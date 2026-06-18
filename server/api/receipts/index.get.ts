import { serverSupabaseUser } from '#supabase/server'
import { useDb } from '~/server/utils/db'
import { receipts } from '~/db/schema'
import { eq, desc, and, gte, lte, count } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const query = getQuery(event)
  const page = Number(query.page) || 1
  const pageSize = Number(query.pageSize) || 20
  const offset = (page - 1) * pageSize

  const db = useDb()

  const conditions = [eq(receipts.userId, user.id)]
  if (query.from) conditions.push(gte(receipts.receiptDatetime, new Date(query.from as string)))
  if (query.to) conditions.push(lte(receipts.receiptDatetime, new Date(query.to as string)))

  const [data, totalResult] = await Promise.all([
    db.select().from(receipts)
      .where(and(...conditions))
      .orderBy(desc(receipts.receiptDatetime))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(receipts).where(and(...conditions)),
  ])

  const total = totalResult[0]?.total ?? 0

  return {
    data: data.map((r: typeof data[0]) => ({
      id: r.id,
      userId: r.userId,
      storeName: r.storeName,
      storeAddress: r.storeAddress ?? null,
      receiptDatetime: r.receiptDatetime.toISOString(),
      subtotal: r.subtotal ? Number(r.subtotal) : null,
      taxTotal: r.taxTotal ? Number(r.taxTotal) : null,
      total: Number(r.total),
      imageUrl: r.imageUrl ?? null,
      rawText: r.rawText ?? null,
      inputMethod: r.inputMethod as 'camera' | 'upload' | 'text',
      processingStatus: r.processingStatus as 'pending' | 'processing' | 'done' | 'error',
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    total: Number(total ?? 0),
    page,
    pageSize,
  }
})
