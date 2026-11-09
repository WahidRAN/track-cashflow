import { serverSupabaseUser } from '#supabase/server'
import { useDb } from '~/server/utils/db'
import { receipts, receiptItems } from '~/db/schema'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const receiptRows = await db.select().from(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.userId, user.id)))
  const receipt = receiptRows[0]

  if (!receipt) throw createError({ statusCode: 404, message: 'Receipt not found' })

  const items = await db.select({
    id: receiptItems.id,
    receiptId: receiptItems.receiptId,
    rawName: receiptItems.rawName,
    generalizedName: receiptItems.generalizedName,
    brandName: receiptItems.brandName,
    quantity: receiptItems.quantity,
    unitPrice: receiptItems.unitPrice,
    lineTotal: receiptItems.lineTotal,
    taxAmount: receiptItems.taxAmount,
    categoryId: receiptItems.categoryId,
    categoryName: receiptItems.categoryName,
    priceIndicator: receiptItems.priceIndicator,
    pricePercentDiff: receiptItems.pricePercentDiff,
    historicalAvgPrice: receiptItems.historicalAvgPrice,
    similarItemsCount: receiptItems.similarItemsCount,
    createdAt: receiptItems.createdAt,
  }).from(receiptItems)
    .where(and(eq(receiptItems.receiptId, id), eq(receiptItems.userId, user.id)))

  return {
    id: receipt.id,
    userId: receipt.userId,
    storeName: receipt.storeName,
    storeAddress: receipt.storeAddress ?? null,
    receiptDatetime: receipt.receiptDatetime.toISOString(),
    subtotal: receipt.subtotal ? Number(receipt.subtotal) : null,
    taxTotal: receipt.taxTotal ? Number(receipt.taxTotal) : null,
    total: Number(receipt.total),
    imageUrl: receipt.imageUrl ?? null,
    rawText: receipt.rawText ?? null,
    inputMethod: receipt.inputMethod as 'camera' | 'upload' | 'text',
    processingStatus: receipt.processingStatus as 'pending' | 'processing' | 'done' | 'error',
    createdAt: receipt.createdAt.toISOString(),
    updatedAt: receipt.updatedAt.toISOString(),
    items: items.map((item: typeof items[0]) => ({
      id: item.id,
      receiptId: item.receiptId,
      rawName: item.rawName,
      generalizedName: item.generalizedName,
      brandName: item.brandName ?? null,
      quantity: item.quantity ? Number(item.quantity) : 1,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
      taxAmount: item.taxAmount ? Number(item.taxAmount) : 0,
      categoryId: item.categoryId ?? null,
      categoryName: item.categoryName ?? null,
      priceIndicator: item.priceIndicator as 'cheaper' | 'similar' | 'expensive' | null,
      pricePercentDiff: item.pricePercentDiff ? Number(item.pricePercentDiff) : null,
      historicalAvgPrice: item.historicalAvgPrice ? Number(item.historicalAvgPrice) : null,
      similarItemsCount: item.similarItemsCount ?? 0,
      createdAt: item.createdAt.toISOString(),
    })),
  }
})
