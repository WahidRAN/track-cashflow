import { serverSupabaseUser } from '#supabase/server'
import { extractReceipt } from '~/server/utils/receiptExtractor'
import type { ExtractReceiptInput } from '~/server/utils/receiptExtractor'
import { useVoyageClient } from '~/server/utils/voyage'
import { useDb, findSimilarItems } from '~/server/utils/db'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { receipts, categories } from '~/db/schema'
import { eq, and } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { ProcessReceiptResponse } from '~/types/api'

export default defineEventHandler(async (event): Promise<ProcessReceiptResponse> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const receiptId = getRouterParam(event, 'id')!
  const db = useDb()
  const supabaseAdmin = useSupabaseAdmin()
  const config = useRuntimeConfig()

  // Load receipt
  const receiptRows = await db.select().from(receipts)
    .where(and(eq(receipts.id, receiptId), eq(receipts.userId, user.id)))
  const receipt = receiptRows[0]

  if (!receipt) throw createError({ statusCode: 404, message: 'Receipt not found' })

  // Rate limit: 50 AI processing calls per 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const countResult = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM receipts
    WHERE user_id = ${user.id}::uuid
      AND processing_status = 'done'
      AND updated_at > ${oneDayAgo}
  `)
  const processedToday = Number((countResult as any)[0]?.count ?? 0)
  if (processedToday >= 50) {
    throw createError({
      statusCode: 429,
      message: 'Daily limit reached (50 receipts/day). Try again tomorrow.',
    })
  }

  // Mark as processing
  await db.update(receipts).set({ processingStatus: 'processing' }).where(eq(receipts.id, receiptId))

  try {
    // --- Step 1: AI extraction (provider from runtimeConfig.aiProvider) ---
    const extractInput: ExtractReceiptInput = {}

    if (receipt.imageUrl) {
      // Fetch image from Supabase Storage as base64
      const urlParts = receipt.imageUrl.split('/storage/v1/object/public/receipts/')
      const storagePath = urlParts[1] ?? ''

      const { data: imageData, error } = await supabaseAdmin.storage
        .from('receipts')
        .download(storagePath)

      if (error || !imageData) throw new Error(`Failed to fetch image: ${error?.message}`)

      const arrayBuffer = await imageData.arrayBuffer()
      extractInput.imageBase64 = Buffer.from(arrayBuffer).toString('base64')
      extractInput.mediaType = imageData.type || undefined
    }
    else if (receipt.rawText) {
      extractInput.text = receipt.rawText
    }

    const extractedData = await extractReceipt(extractInput)

    // --- Step 2: Update receipt metadata ---
    await db.update(receipts).set({
      storeName: extractedData.store_name,
      storeAddress: extractedData.store_address || null,
      receiptDatetime: new Date(extractedData.receipt_datetime),
      subtotal: extractedData.subtotal?.toString() || null,
      taxTotal: extractedData.tax_total?.toString() || null,
      total: extractedData.total.toString(),
    }).where(eq(receipts.id, receiptId))

    // --- Step 3: Voyage AI embeddings (optional) ---
    // Skipped when VOYAGE_API_KEY is unset (e.g. fully local Ollama setup);
    // items are still saved, just without price comparison.
    const items = extractedData.items

    const textsToEmbed = items.map(item =>
      [item.generalized_name, item.brand_name].filter(Boolean).join(' '),
    )

    let embeddings: number[][] = []
    if (textsToEmbed.length > 0 && config.voyageApiKey) {
      try {
        const embeddingResult = await useVoyageClient().embed({
          input: textsToEmbed,
          model: 'voyage-3-lite',
        })
        embeddings = embeddingResult.data?.map((d: any) => d.embedding as number[]) || []
      }
      catch (embedErr: any) {
        console.warn(`[process] Voyage embedding failed for receipt ${receiptId}; saving items without price comparison:`, embedErr?.message || embedErr)
        embeddings = []
      }
    }

    // --- Step 4: Load categories for lookup ---
    const allCategories = await db.select().from(categories)
    const categoryMap = new Map(allCategories.map((c: typeof allCategories[0]) => [c.name, c]))

    // --- Step 5: For each item, find similar historical items and compute price indicator ---
    const insertedItems = []

    for (const [i, item] of items.entries()) {
      const embedding = embeddings[i] || null
      const category = categoryMap.get(item.category)

      let priceIndicator: string | null = null
      let pricePercentDiff: number | null = null
      let historicalAvgPrice: number | null = null
      let similarItemsCount = 0

      if (embedding && embedding.length > 0 && item.unit_price > 0) {
        const similar = await findSimilarItems(db, user.id, embedding)
        similarItemsCount = similar.length

        if (similar.length > 0) {
          const avgPrice = similar.reduce((sum: number, s: { unit_price: string; similarity: number }) => sum + parseFloat(s.unit_price), 0) / similar.length
          historicalAvgPrice = Math.round(avgPrice * 100) / 100
          const currentPrice = item.unit_price
          const diffPct = ((currentPrice - avgPrice) / avgPrice) * 100
          pricePercentDiff = Math.round(diffPct * 10) / 10

          if (diffPct < -5) priceIndicator = 'cheaper'
          else if (diffPct > 5) priceIndicator = 'expensive'
          else priceIndicator = 'similar'
        }
      }

      const itemId = crypto.randomUUID()
      const vectorStr = embedding ? `[${embedding.join(',')}]` : null

      // Insert item with raw SQL for the vector column
      await db.execute(sql`
        INSERT INTO receipt_items (
          id, receipt_id, user_id, raw_name, generalized_name, brand_name,
          quantity, unit_price, line_total, tax_amount,
          category_id, category_name,
          embedding,
          price_indicator, price_percent_diff, historical_avg_price, similar_items_count
        ) VALUES (
          ${itemId}::uuid,
          ${receiptId}::uuid,
          ${user.id}::uuid,
          ${item.raw_name},
          ${item.generalized_name},
          ${item.brand_name || null},
          ${(item.quantity || 1).toString()},
          ${item.unit_price.toString()},
          ${item.line_total.toString()},
          ${(item.tax_amount || 0).toString()},
          ${category?.id || null}::uuid,
          ${item.category},
          ${vectorStr ? sql`${vectorStr}::vector` : sql`NULL`},
          ${priceIndicator},
          ${pricePercentDiff?.toString() || null},
          ${historicalAvgPrice?.toString() || null},
          ${similarItemsCount}
        )
      `)

      insertedItems.push({
        id: itemId,
        receiptId,
        rawName: item.raw_name,
        generalizedName: item.generalized_name,
        brandName: item.brand_name || null,
        quantity: item.quantity || 1,
        unitPrice: item.unit_price,
        lineTotal: item.line_total,
        taxAmount: item.tax_amount || 0,
        categoryId: category?.id || null,
        categoryName: item.category,
        priceIndicator: priceIndicator as 'cheaper' | 'similar' | 'expensive' | null,
        pricePercentDiff,
        historicalAvgPrice,
        similarItemsCount,
        createdAt: new Date().toISOString(),
      })
    }

    // Mark done
    await db.update(receipts).set({ processingStatus: 'done' }).where(eq(receipts.id, receiptId))

    // Reload receipt for response
    const reloadedRows = await db.select().from(receipts).where(eq(receipts.id, receiptId))
    const updatedReceipt = reloadedRows[0]
    if (!updatedReceipt) throw new Error('Receipt not found after update')

    return {
      receipt: {
        id: updatedReceipt.id,
        userId: updatedReceipt.userId,
        storeName: updatedReceipt.storeName,
        storeAddress: updatedReceipt.storeAddress ?? null,
        receiptDatetime: updatedReceipt.receiptDatetime.toISOString(),
        subtotal: updatedReceipt.subtotal ? Number(updatedReceipt.subtotal) : null,
        taxTotal: updatedReceipt.taxTotal ? Number(updatedReceipt.taxTotal) : null,
        total: Number(updatedReceipt.total),
        imageUrl: updatedReceipt.imageUrl ?? null,
        rawText: updatedReceipt.rawText ?? null,
        inputMethod: updatedReceipt.inputMethod as 'camera' | 'upload' | 'text',
        processingStatus: updatedReceipt.processingStatus as 'pending' | 'processing' | 'done' | 'error',
        createdAt: updatedReceipt.createdAt.toISOString(),
        updatedAt: updatedReceipt.updatedAt.toISOString(),
      },
      items: insertedItems,
    }
  }
  catch (err: any) {
    await db.update(receipts).set({ processingStatus: 'error' }).where(eq(receipts.id, receiptId))
    throw createError({ statusCode: 500, message: err.message || 'Processing failed' })
  }
})
