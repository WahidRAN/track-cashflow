import { and, eq } from 'drizzle-orm'
import { requireUserId } from '~/server/utils/auth'
import { useDb } from '~/server/utils/db'
import { resolveTimezone, parseDateTimeInZone } from '~/server/utils/datetime'
import {
  MAX_MONEY, badRequest, notFound, readJsonObject, readNumberField, readStringField, requireUuidParam,
} from '~/server/utils/request'
import { toReceiptDto } from '~/server/utils/receiptDto'
import { receipts } from '~/db/schema'
import type { Receipt } from '~/types/api'

const money = { min: -MAX_MONEY, max: MAX_MONEY }

/** Update receipt metadata. Body: UpdateReceiptBody (all fields optional). */
export default defineEventHandler(async (event): Promise<Receipt> => {
  const userId = await requireUserId(event)
  const id = requireUuidParam(event)
  const body = await readJsonObject(event)
  const db = useDb()

  const updates: Partial<typeof receipts.$inferInsert> = {}

  const storeName = readStringField(body, 'storeName', { maxLength: 200 })
  if (storeName) updates.storeName = storeName

  const storeAddress = readStringField(body, 'storeAddress', { nullable: true, maxLength: 500 })
  if (storeAddress !== undefined) updates.storeAddress = storeAddress

  const receiptDatetime = readStringField(body, 'receiptDatetime')
  if (receiptDatetime) {
    const d = parseDateTimeInZone(receiptDatetime, resolveTimezone(event))
    if (!d) throw badRequest('receiptDatetime must be an ISO 8601 date/time')
    updates.receiptDatetime = d
  }

  const subtotal = readNumberField(body, 'subtotal', { nullable: true, ...money })
  if (subtotal !== undefined) updates.subtotal = subtotal === null ? null : String(subtotal)

  const taxTotal = readNumberField(body, 'taxTotal', { nullable: true, ...money })
  if (taxTotal !== undefined) updates.taxTotal = taxTotal === null ? null : String(taxTotal)

  const total = readNumberField(body, 'total', money)
  if (total !== undefined && total !== null) updates.total = String(total)

  const where = and(eq(receipts.id, id), eq(receipts.userId, userId))
  const [row] = Object.keys(updates).length > 0
    ? await db.update(receipts).set(updates).where(where).returning()
    : await db.select().from(receipts).where(where)
  if (!row) throw notFound('Receipt not found')

  return toReceiptDto(row)
})
