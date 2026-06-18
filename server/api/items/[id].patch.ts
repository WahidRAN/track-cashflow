import { serverSupabaseUser } from '#supabase/server'
import { useDb, findSimilarItems } from '~/server/utils/db'
import { useVoyageClient } from '~/server/utils/voyage'
import { receiptItems } from '~/db/schema'
import { eq, and } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = useDb()

  const existingRows = await db.select().from(receiptItems)
    .where(and(eq(receiptItems.id, id), eq(receiptItems.userId, user.id)))
  const existing = existingRows[0]

  if (!existing) throw createError({ statusCode: 404, message: 'Item not found' })

  const nameChanged = body.generalizedName && body.generalizedName !== existing.generalizedName

  // If name changed, regenerate embedding and recompute price comparison
  if (nameChanged) {
    const voyage = useVoyageClient()
    const textToEmbed = [body.generalizedName, body.brandName || existing.brandName].filter(Boolean).join(' ')

    const result = await voyage.embed({ input: [textToEmbed], model: 'voyage-3-lite' })
    const embedding = result.data?.[0]?.embedding as number[] | undefined

    let priceIndicator: string | null = null
    let pricePercentDiff: number | null = null
    let historicalAvgPrice: number | null = null
    let similarItemsCount = 0

    if (embedding) {
      const similar = await findSimilarItems(db, user.id, embedding)
      similarItemsCount = similar.length
      if (similar.length > 0) {
        const avg = similar.reduce((s: number, x: { unit_price: string; similarity: number }) => s + parseFloat(x.unit_price), 0) / similar.length
        historicalAvgPrice = Math.round(avg * 100) / 100
        const diff = ((Number(body.unitPrice ?? existing.unitPrice) - avg) / avg) * 100
        pricePercentDiff = Math.round(diff * 10) / 10
        priceIndicator = diff < -5 ? 'cheaper' : diff > 5 ? 'expensive' : 'similar'
      }

      const vectorStr = `[${embedding.join(',')}]`
      await db.execute(sql`
        UPDATE receipt_items SET
          generalized_name = ${body.generalizedName ?? existing.generalizedName},
          brand_name = ${body.brandName ?? existing.brandName ?? null},
          unit_price = ${(body.unitPrice ?? existing.unitPrice).toString()},
          line_total = ${(body.lineTotal ?? existing.lineTotal).toString()},
          quantity = ${(body.quantity ?? existing.quantity ?? 1).toString()},
          category_name = ${body.categoryName ?? existing.categoryName},
          embedding = ${vectorStr}::vector,
          price_indicator = ${priceIndicator},
          price_percent_diff = ${pricePercentDiff?.toString() ?? null},
          historical_avg_price = ${historicalAvgPrice?.toString() ?? null},
          similar_items_count = ${similarItemsCount}
        WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid
      `)
    }
  }
  else {
    // Simple update without re-embedding
    await db.update(receiptItems).set({
      generalizedName: body.generalizedName ?? existing.generalizedName,
      brandName: body.brandName !== undefined ? body.brandName : existing.brandName,
      unitPrice: body.unitPrice?.toString() ?? existing.unitPrice,
      lineTotal: body.lineTotal?.toString() ?? existing.lineTotal,
      quantity: body.quantity?.toString() ?? existing.quantity,
      categoryName: body.categoryName ?? existing.categoryName,
    }).where(and(eq(receiptItems.id, id), eq(receiptItems.userId, user.id)))
  }

  const updatedRows = await db.select().from(receiptItems).where(eq(receiptItems.id, id))
  const updated = updatedRows[0]
  if (!updated) throw createError({ statusCode: 404, message: 'Item not found after update' })
  return {
    id: updated.id,
    receiptId: updated.receiptId,
    rawName: updated.rawName,
    generalizedName: updated.generalizedName,
    brandName: updated.brandName ?? null,
    quantity: updated.quantity ? Number(updated.quantity) : 1,
    unitPrice: Number(updated.unitPrice),
    lineTotal: Number(updated.lineTotal),
    taxAmount: updated.taxAmount ? Number(updated.taxAmount) : 0,
    categoryId: updated.categoryId ?? null,
    categoryName: updated.categoryName ?? null,
    priceIndicator: updated.priceIndicator as 'cheaper' | 'similar' | 'expensive' | null,
    pricePercentDiff: updated.pricePercentDiff ? Number(updated.pricePercentDiff) : null,
    historicalAvgPrice: updated.historicalAvgPrice ? Number(updated.historicalAvgPrice) : null,
    similarItemsCount: updated.similarItemsCount ?? 0,
    createdAt: updated.createdAt.toISOString(),
  }
})
