import { and, count, desc, eq, gte, ilike, lt, or, sql, type SQL } from 'drizzle-orm'
import { requireUserId } from '~/server/utils/auth'
import { useDb } from '~/server/utils/db'
import { resolveTimezone } from '~/server/utils/datetime'
import { escapeLike, readDateRangeQuery, readIntQuery } from '~/server/utils/request'
import { toReceiptDto } from '~/server/utils/receiptDto'
import { receipts } from '~/db/schema'
import type { ReceiptListResponse } from '~/types/api'

/**
 * Paginated receipt list, newest first.
 * Query: page, pageSize (≤100), from, to (ISO datetime, or YYYY-MM-DD = whole
 * local day), search (substring of store name or any item name), category.
 */
export default defineEventHandler(async (event): Promise<ReceiptListResponse> => {
  const userId = await requireUserId(event)
  const query = getQuery(event)
  const page = readIntQuery(query.page, 1, 1, 10_000)
  const pageSize = readIntQuery(query.pageSize, 20, 1, 100)
  const { from, toExclusive } = readDateRangeQuery(event, resolveTimezone(event))
  const db = useDb()

  const conditions: SQL[] = [eq(receipts.userId, userId)]
  if (from) conditions.push(gte(receipts.receiptDatetime, from))
  if (toExclusive) conditions.push(lt(receipts.receiptDatetime, toExclusive))

  // Substring match (ILIKE) rather than full-text search: store names are often
  // Japanese, which english tsvector can't split, and partial input should match.
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : ''
  if (search) {
    const pattern = `%${escapeLike(search)}%`
    conditions.push(or(
      ilike(receipts.storeName, pattern),
      sql`EXISTS (
        SELECT 1 FROM public.receipt_items ri
        WHERE ri.receipt_id = ${receipts.id}
          AND (ri.generalized_name ILIKE ${pattern} OR ri.raw_name ILIKE ${pattern} OR ri.brand_name ILIKE ${pattern})
      )`,
    )!)
  }

  const category = typeof query.category === 'string' ? query.category.trim() : ''
  if (category) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM public.receipt_items ri
      WHERE ri.receipt_id = ${receipts.id}
        AND ri.category_name = ${category}
    )`)
  }

  const where = and(...conditions)
  const [rows, totalResult] = await Promise.all([
    db.select().from(receipts)
      .where(where)
      .orderBy(desc(receipts.receiptDatetime), desc(receipts.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(receipts).where(where),
  ])

  return {
    data: rows.map(toReceiptDto),
    total: Number(totalResult[0]?.total ?? 0),
    page,
    pageSize,
  }
})
