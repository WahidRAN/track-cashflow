import { sql } from 'drizzle-orm'
import { requireUserId } from '~/server/utils/auth'
import { useDb } from '~/server/utils/db'
import { resolveTimezone, startOfMonthInZone } from '~/server/utils/datetime'
import { readDateRangeQuery } from '~/server/utils/request'
import type { CategoryBreakdownResponse } from '~/types/api'

/**
 * Spend per category for [from, to). Defaults to the current calendar month
 * in the household's timezone. from/to: ISO datetime or YYYY-MM-DD.
 */
export default defineEventHandler(async (event): Promise<CategoryBreakdownResponse> => {
  const userId = await requireUserId(event)
  const tz = resolveTimezone(event)
  const range = readDateRangeQuery(event, tz)
  const now = new Date()
  const from = range.from ?? startOfMonthInZone(now, tz)
  const toExclusive = range.toExclusive ?? startOfMonthInZone(now, tz, 1)

  // Dates go in as ISO strings — see the note in server/utils/db.ts
  const rows = await useDb().execute<{
    category_id: string | null
    category_name: string | null
    category_icon: string | null
    category_color: string | null
    total: number | null
    item_count: number
  }>(sql`
    SELECT
      ri.category_id,
      ri.category_name,
      c.icon AS category_icon,
      c.color AS category_color,
      SUM(ri.line_total)::float8 AS total,
      COUNT(ri.id)::int AS item_count
    FROM public.receipt_items ri
    LEFT JOIN public.categories c ON c.id = ri.category_id
    INNER JOIN public.receipts r ON r.id = ri.receipt_id
    WHERE ri.user_id = ${userId}::uuid
      AND r.processing_status = 'done'
      -- Discount lines (値引) are negative and can't be attributed to a category;
      -- including them produced negative slices and >100% shares in the chart
      AND ri.line_total > 0
      AND r.receipt_datetime >= ${from.toISOString()}::timestamptz
      AND r.receipt_datetime < ${toExclusive.toISOString()}::timestamptz
    GROUP BY ri.category_id, ri.category_name, c.icon, c.color
    ORDER BY total DESC
  `)

  const categoriesOut = Array.from(rows, (r) => {
    const name = r.category_name || 'Uncategorized'
    return {
      categoryId: r.category_id ?? `uncategorized:${name}`,
      categoryName: name,
      categoryIcon: r.category_icon ?? null,
      categoryColor: r.category_color ?? null,
      total: r.total ?? 0,
      itemCount: r.item_count,
    }
  })

  return {
    categories: categoriesOut,
    total: categoriesOut.reduce((sum, c) => sum + c.total, 0),
    dateFrom: from.toISOString(),
    dateTo: new Date(toExclusive.getTime() - 1).toISOString(),
  }
})
