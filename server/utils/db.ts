import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { and, desc, eq, gt, ne } from 'drizzle-orm'
import * as schema from '~/db/schema'
import { receipts, receiptItems } from '~/db/schema'
import { computePriceIndicator, type PriceComparison } from '~/server/utils/pricing'

// NOTE for raw `sql` templates: drizzle's postgres-js driver disables
// postgres-js' Date serializer, so a JS Date interpolated into db.execute(sql`…`)
// crashes the driver ("argument must be of type string … Received an instance
// of Date"). Pass `date.toISOString()` with a `::timestamptz` cast instead.
// Query-builder comparisons on timestamp columns (gte(col, date)) are fine.
// db.execute() returns a postgres-js RowList (an array of rows), not { rows }.

export type Db = PostgresJsDatabase<typeof schema>

let _db: Db | null = null

export function useDb(): Db {
  if (!_db) {
    const { databaseUrl } = useRuntimeConfig()
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set (local Supabase: postgresql://postgres:postgres@127.0.0.1:54322/postgres)')
    }
    // prepare: false — Supabase's transaction-mode pooler (port 6543, used on
    // Vercel) doesn't support prepared statements; harmless on a direct connection.
    const client = postgres(databaseUrl, { prepare: false })
    _db = drizzle(client, { schema })
  }
  return _db
}

export interface PriceHistoryEntry {
  unitPrice: number
  storeName: string
  receiptDatetime: Date
}

/**
 * Most recent previous purchases of exactly this (normalized) generalized
 * name by the user, newest first. Only positive unit prices (no discount lines).
 */
export async function getPriceHistory(
  db: Pick<Db, 'select'>,
  userId: string,
  generalizedName: string,
  opts: { excludeReceiptId?: string, limit?: number } = {},
): Promise<PriceHistoryEntry[]> {
  const rows = await db
    .select({
      unitPrice: receiptItems.unitPrice,
      storeName: receipts.storeName,
      receiptDatetime: receipts.receiptDatetime,
    })
    .from(receiptItems)
    .innerJoin(receipts, eq(receipts.id, receiptItems.receiptId))
    .where(and(
      eq(receiptItems.userId, userId),
      eq(receiptItems.generalizedName, generalizedName),
      gt(receiptItems.unitPrice, '0'),
      opts.excludeReceiptId ? ne(receiptItems.receiptId, opts.excludeReceiptId) : undefined,
    ))
    .orderBy(desc(receipts.receiptDatetime), desc(receiptItems.createdAt))
    .limit(opts.limit ?? 20)

  return rows.map(r => ({
    unitPrice: Number(r.unitPrice),
    storeName: r.storeName,
    receiptDatetime: r.receiptDatetime,
  }))
}

/** Price indicator for one item against its price history (no query for discount lines) */
export async function comparePrice(
  db: Pick<Db, 'select'>,
  userId: string,
  generalizedName: string,
  unitPrice: number,
  opts: { excludeReceiptId?: string } = {},
): Promise<PriceComparison> {
  if (!(unitPrice > 0)) return computePriceIndicator(unitPrice, [])
  const history = await getPriceHistory(db, userId, generalizedName, opts)
  return computePriceIndicator(unitPrice, history.map(h => h.unitPrice))
}

/** PriceComparison → receipt_items column values (NUMERIC columns take strings) */
export function priceComparisonColumns(c: PriceComparison) {
  return {
    priceIndicator: c.priceIndicator,
    pricePercentDiff: c.pricePercentDiff === null ? null : String(c.pricePercentDiff),
    historicalAvgPrice: c.historicalAvgPrice === null ? null : String(c.historicalAvgPrice),
    similarItemsCount: c.similarItemsCount,
  }
}
