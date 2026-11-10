import { and, eq } from 'drizzle-orm'
import { requireUserId } from '~/server/utils/auth'
import { useDb, comparePrice, priceComparisonColumns } from '~/server/utils/db'
import { normalizeGeneralizedName } from '~/server/utils/pricing'
import {
  MAX_MONEY, MAX_QUANTITY, badRequest, notFound, readJsonObject, readNumberField, readStringField, requireUuidParam,
} from '~/server/utils/request'
import { toReceiptItemDto } from '~/server/utils/receiptDto'
import { categories, receiptItems } from '~/db/schema'
import type { ReceiptItem } from '~/types/api'

const money = { min: -MAX_MONEY, max: MAX_MONEY }

/**
 * Update a receipt item. Body: UpdateItemBody (all fields optional).
 * generalizedName is normalized; changing it or unitPrice recomputes the price indicator.
 */
export default defineEventHandler(async (event): Promise<ReceiptItem> => {
  const userId = await requireUserId(event)
  const id = requireUuidParam(event)
  const body = await readJsonObject(event)
  const db = useDb()

  const where = and(eq(receiptItems.id, id), eq(receiptItems.userId, userId))
  const [existing] = await db.select().from(receiptItems).where(where)
  if (!existing) throw notFound('Item not found')

  const updates: Partial<typeof receiptItems.$inferInsert> = {}

  const generalizedName = readStringField(body, 'generalizedName', { maxLength: 200 })
  if (generalizedName) {
    const normalized = normalizeGeneralizedName(generalizedName)
    if (!normalized) throw badRequest('generalizedName must not be empty')
    updates.generalizedName = normalized
  }

  const brandName = readStringField(body, 'brandName', { nullable: true, maxLength: 100 })
  if (brandName !== undefined) updates.brandName = brandName

  const quantity = readNumberField(body, 'quantity', { min: 0.01, max: MAX_QUANTITY })
  if (quantity != null) updates.quantity = String(quantity)

  const unitPrice = readNumberField(body, 'unitPrice', money)
  if (unitPrice != null) updates.unitPrice = String(unitPrice)

  const lineTotal = readNumberField(body, 'lineTotal', money)
  if (lineTotal != null) updates.lineTotal = String(lineTotal)

  const taxAmount = readNumberField(body, 'taxAmount', { nullable: true, ...money })
  if (taxAmount !== undefined) updates.taxAmount = String(taxAmount ?? 0)

  // Keep category_id in sync with the name — analytics group and join on it
  const categoryName = readStringField(body, 'categoryName', { nullable: true, maxLength: 50 })
  if (categoryName !== undefined) {
    const [category] = categoryName
      ? await db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.name, categoryName))
      : []
    updates.categoryName = category?.name ?? categoryName
    updates.categoryId = category?.id ?? null
  }

  const nextName = updates.generalizedName ?? existing.generalizedName
  const nextUnitPrice = unitPrice ?? Number(existing.unitPrice)
  if (nextName !== existing.generalizedName || nextUnitPrice !== Number(existing.unitPrice)) {
    const comparison = await comparePrice(db, userId, nextName, nextUnitPrice, { excludeReceiptId: existing.receiptId })
    Object.assign(updates, priceComparisonColumns(comparison))
  }

  if (Object.keys(updates).length === 0) return toReceiptItemDto(existing)

  const [updated] = await db.update(receiptItems).set(updates).where(where).returning()
  if (!updated) throw notFound('Item not found')
  return toReceiptItemDto(updated)
})
