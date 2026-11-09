import { serverSupabaseUser } from '#supabase/server'
import { useDb } from '~/server/utils/db'
import { sql } from 'drizzle-orm'
import type { CategoryBreakdownResponse } from '~/types/api'

export default defineEventHandler(async (event): Promise<CategoryBreakdownResponse> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const query = getQuery(event)
  const db = useDb()

  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const dateFrom = query.from ? new Date(query.from as string) : firstOfMonth
  const dateTo = query.to ? new Date(query.to as string) : now

  const rows = await db.execute(sql`
    SELECT
      ri.category_id,
      ri.category_name,
      c.icon AS category_icon,
      c.color AS category_color,
      SUM(ri.line_total)::float AS total,
      COUNT(ri.id)::int AS item_count
    FROM receipt_items ri
    LEFT JOIN categories c ON c.id = ri.category_id
    INNER JOIN receipts r ON r.id = ri.receipt_id
    WHERE ri.user_id = ${user.id}::uuid
      AND r.receipt_datetime >= ${dateFrom}
      AND r.receipt_datetime <= ${dateTo}
    GROUP BY ri.category_id, ri.category_name, c.icon, c.color
    ORDER BY total DESC
  `)

  const rowsArray = Array.from(rows)
  const totalSpend = rowsArray.reduce((s: number, r: any) => s + ((r.total as number) || 0), 0)

  return {
    categories: rowsArray.map((r: any) => ({
      categoryId: r.category_id as string,
      categoryName: (r.category_name as string) || 'Uncategorized',
      categoryIcon: (r.category_icon as string | null) ?? null,
      categoryColor: (r.category_color as string | null) ?? null,
      total: (r.total as number) || 0,
      itemCount: r.item_count as number,
    })),
    total: totalSpend,
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
  }
})
