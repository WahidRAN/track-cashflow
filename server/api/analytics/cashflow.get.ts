import { serverSupabaseUser } from '#supabase/server'
import { useDb } from '~/server/utils/db'
import { sql } from 'drizzle-orm'
import type { CashflowResponse } from '~/types/api'

export default defineEventHandler(async (event): Promise<CashflowResponse> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const db = useDb()
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

  const rows = await db.execute(sql`
    SELECT
      EXTRACT(YEAR FROM receipt_datetime)::int AS year,
      EXTRACT(MONTH FROM receipt_datetime)::int AS month,
      SUM(total)::float AS total,
      COUNT(*)::int AS receipt_count
    FROM receipts
    WHERE user_id = ${user.id}::uuid
      AND receipt_datetime >= ${twelveMonthsAgo}
    GROUP BY year, month
    ORDER BY year DESC, month DESC
  `)

  return {
    months: Array.from(rows).map((r: any) => ({
      year: r.year as number,
      month: r.month as number,
      total: r.total as number,
      itemCount: 0,
      receiptCount: r.receipt_count as number,
    })),
  }
})
