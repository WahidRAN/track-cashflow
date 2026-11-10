import { and, count, eq, gt, lt, ne, or } from 'drizzle-orm'
import { requireUserId } from '~/server/utils/auth'
import { extractReceipt } from '~/server/utils/receiptExtractor'
import type { ExtractReceiptInput } from '~/server/utils/receiptExtractor'
import { useDb, getPriceHistory, priceComparisonColumns } from '~/server/utils/db'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { resolveTimezone } from '~/server/utils/datetime'
import { notFound, requireUuidParam } from '~/server/utils/request'
import { RECEIPTS_BUCKET, toReceiptDto, toReceiptItemDto, toStoragePath } from '~/server/utils/receiptDto'
import { computePriceIndicator } from '~/server/utils/pricing'
import { receipts, receiptItems, categories } from '~/db/schema'
import type { ProcessReceiptResponse } from '~/types/api'

const DAILY_LIMIT = 50
const DAY_MS = 24 * 60 * 60 * 1000
/** A receipt stuck in 'processing' longer than this (crashed run) may be processed again */
const STALE_PROCESSING_MS = 5 * 60 * 1000

/**
 * Run AI extraction on a pending receipt, compute price indicators from the
 * user's price history (exact generalized-name match) and store the items.
 * Safe to call again on a processed / failed receipt: items are replaced.
 */
export default defineEventHandler(async (event): Promise<ProcessReceiptResponse> => {
  const userId = await requireUserId(event)
  const receiptId = requireUuidParam(event)
  const timezone = resolveTimezone(event)
  const db = useDb()

  const [receipt] = await db.select().from(receipts)
    .where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)))
  if (!receipt) throw notFound('Receipt not found')

  // Rate limit: 50 processed receipts per 24 hours
  const [usage] = await db.select({ processed: count() }).from(receipts)
    .where(and(
      eq(receipts.userId, userId),
      eq(receipts.processingStatus, 'done'),
      gt(receipts.updatedAt, new Date(Date.now() - DAY_MS)),
    ))
  if ((usage?.processed ?? 0) >= DAILY_LIMIT) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      message: `Daily limit reached (${DAILY_LIMIT} receipts/day). Try again tomorrow.`,
    })
  }

  // Claim atomically so a double-submit can't process (and insert items) twice
  const claimed = await db.update(receipts)
    .set({ processingStatus: 'processing' })
    .where(and(
      eq(receipts.id, receiptId),
      eq(receipts.userId, userId),
      or(
        ne(receipts.processingStatus, 'processing'),
        lt(receipts.updatedAt, new Date(Date.now() - STALE_PROCESSING_MS)),
      ),
    ))
    .returning({ id: receipts.id })
  if (claimed.length === 0) {
    throw createError({ statusCode: 409, statusMessage: 'Conflict', message: 'This receipt is already being processed' })
  }

  try {
    // --- 1. AI extraction (provider from runtimeConfig.aiProvider) ---
    const extractInput: ExtractReceiptInput = { timezone }
    if (receipt.imageUrl) {
      const { data: imageData, error } = await useSupabaseAdmin().storage
        .from(RECEIPTS_BUCKET)
        .download(toStoragePath(receipt.imageUrl))
      if (error || !imageData) throw new Error(`Failed to fetch receipt image: ${error?.message ?? 'not found'}`)
      extractInput.imageBase64 = Buffer.from(await imageData.arrayBuffer()).toString('base64')
      extractInput.mediaType = imageData.type || undefined
    }
    else if (receipt.rawText) {
      extractInput.text = receipt.rawText
    }

    const extracted = await extractReceipt(extractInput)

    // --- 2. Price comparison against previous purchases of the same generalized name ---
    // One history query per distinct name; discount lines (price <= 0) get no indicator
    const names = [...new Set(extracted.items.filter(i => i.unit_price > 0).map(i => i.generalized_name))]
    const historyByName = new Map<string, number[]>()
    await Promise.all(names.map(async (name) => {
      const history = await getPriceHistory(db, userId, name, { excludeReceiptId: receiptId })
      historyByName.set(name, history.map(h => h.unitPrice))
    }))

    const categoryRows = await db.select({ id: categories.id, name: categories.name }).from(categories)
    const categoryIdByName = new Map(categoryRows.map(c => [c.name, c.id]))

    const itemRows: Array<typeof receiptItems.$inferInsert> = extracted.items.map((item, position) => {
      const comparison = computePriceIndicator(item.unit_price, historyByName.get(item.generalized_name) ?? [])
      return {
        receiptId,
        userId,
        position,
        rawName: item.raw_name,
        generalizedName: item.generalized_name,
        brandName: item.brand_name ?? null,
        quantity: String(item.quantity),
        unitPrice: String(item.unit_price),
        lineTotal: String(item.line_total),
        taxAmount: String(item.tax_amount),
        categoryId: categoryIdByName.get(item.category) ?? null,
        categoryName: item.category,
        ...priceComparisonColumns(comparison),
      }
    })

    // --- 3. Store everything atomically (replaces items from an earlier run) ---
    const { updated, inserted } = await db.transaction(async (tx) => {
      await tx.delete(receiptItems).where(eq(receiptItems.receiptId, receiptId))
      const inserted = itemRows.length > 0
        ? await tx.insert(receiptItems).values(itemRows).returning()
        : []
      const [updated] = await tx.update(receipts).set({
        storeName: extracted.store_name,
        storeAddress: extracted.store_address ?? null,
        receiptDatetime: new Date(extracted.receipt_datetime),
        subtotal: extracted.subtotal === undefined ? null : String(extracted.subtotal),
        taxTotal: extracted.tax_total === undefined ? null : String(extracted.tax_total),
        total: String(extracted.total),
        processingStatus: 'done',
      }).where(eq(receipts.id, receiptId)).returning()
      if (!updated) throw new Error('Receipt disappeared during processing')
      return { updated, inserted }
    })

    return {
      receipt: toReceiptDto(updated),
      items: inserted.sort((a, b) => a.position - b.position).map(toReceiptItemDto),
    }
  }
  catch (err: any) {
    console.error(`[process] receipt ${receiptId} failed:`, err)
    await db.update(receipts).set({ processingStatus: 'error' }).where(eq(receipts.id, receiptId))
      .catch((e: unknown) => console.error('[process] could not mark receipt as error:', e))
    throw createError({
      statusCode: 500,
      statusMessage: 'Processing failed',
      message: err?.message || 'Processing failed',
    })
  }
})
