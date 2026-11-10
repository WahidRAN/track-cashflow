import { sql } from 'drizzle-orm'
import { requireUserId } from '~/server/utils/auth'
import { useDb } from '~/server/utils/db'
import { resolveTimezone, startOfMonthInZone } from '~/server/utils/datetime'
import type { CashflowResponse } from '~/types/api'

/** Monthly totals for the last 12 calendar months (incl. the current one), newest first */
export default defineEventHandler(async (event): Promise<CashflowResponse> => {
  const userId = await requireUserId(event)
  const tz = resolveTimezone(event)
  const since = startOfMonthInZone(new Date(), tz, -11)

  // Months are bucketed in the household's timezone, not the DB's (UTC).
  // Dates go in as ISO strings — see the note in server/utils/db.ts.
  const rows = await useDb().execute<{ year: number, month: number, total: number, receipt_count: number, item_count: number }>(sql`
    WITH monthly AS (
      SELECT
        date_trunc('month', r.receipt_datetime AT TIME ZONE ${tz}) AS month_start,
        r.total,
        (SELECT COUNT(*) FROM public.receipt_items ri WHERE ri.receipt_id = r.id) AS item_count
      FROM public.receipts r
      WHERE r.user_id = ${userId}::uuid
        AND r.processing_status = 'done'
        AND r.receipt_datetime >= ${since.toISOString()}::timestamptz
    )
    SELECT
      EXTRACT(YEAR FROM month_start)::int AS year,
      EXTRACT(MONTH FROM month_start)::int AS month,
      SUM(total)::float8 AS total,
      COUNT(*)::int AS receipt_count,
      SUM(item_count)::int AS item_count
    FROM monthly
    GROUP BY month_start
    ORDER BY month_start DESC
  `)

  return {
    months: Array.from(rows, r => ({
      year: r.year,
      month: r.month,
      total: r.total ?? 0,
      itemCount: r.item_count ?? 0,
      receiptCount: r.receipt_count,
    })),
  }
})
