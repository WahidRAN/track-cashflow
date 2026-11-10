import { and, asc, eq } from 'drizzle-orm'
import { requireUserId } from '~/server/utils/auth'
import { useDb } from '~/server/utils/db'
import { notFound, requireUuidParam } from '~/server/utils/request'
import { toReceiptDto, toReceiptItemDto } from '~/server/utils/receiptDto'
import { receipts, receiptItems } from '~/db/schema'
import type { Receipt, ReceiptItem } from '~/types/api'

export default defineEventHandler(async (event): Promise<Receipt & { items: ReceiptItem[] }> => {
  const userId = await requireUserId(event)
  const id = requireUuidParam(event)
  const db = useDb()

  const [receipt] = await db.select().from(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
  if (!receipt) throw notFound('Receipt not found')

  const items = await db.select().from(receiptItems)
    .where(and(eq(receiptItems.receiptId, id), eq(receiptItems.userId, userId)))
    .orderBy(asc(receiptItems.position), asc(receiptItems.createdAt))

  return { ...toReceiptDto(receipt), items: items.map(toReceiptItemDto) }
})
