import Anthropic from '@anthropic-ai/sdk'
import { serverSupabaseUser } from '#supabase/server'
import { useAnthropicClient } from '~/server/utils/claude'
import { useVoyageClient } from '~/server/utils/voyage'
import { useDb, findSimilarItems } from '~/server/utils/db'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { receipts, receiptItems, categories } from '~/db/schema'
import { eq, and } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { ProcessReceiptResponse } from '~/types/api'

// JSON schema for Claude structured output
const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    store_name: { type: 'string' },
    store_address: { type: 'string' },
    receipt_datetime: { type: 'string', description: 'ISO 8601 datetime, best guess if not shown' },
    subtotal: { type: 'number' },
    tax_total: { type: 'number' },
    total: { type: 'number' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          raw_name: { type: 'string', description: 'Exact text from receipt' },
          generalized_name: { type: 'string', description: 'Human-readable product name, normalized' },
          brand_name: { type: 'string' },
          quantity: { type: 'number' },
          unit_price: { type: 'number' },
          line_total: { type: 'number' },
          tax_amount: { type: 'number' },
          category: {
            type: 'string',
            enum: ['Groceries', 'Personal Care', 'Household', 'Pharmacy', 'Restaurant', 'Coffee', 'Clothing', 'Electronics', 'Transportation', 'Entertainment', 'Other'],
          },
        },
        required: ['raw_name', 'generalized_name', 'unit_price', 'line_total', 'category'],
        additionalProperties: false,
      },
    },
  },
  required: ['store_name', 'receipt_datetime', 'total', 'items'],
  additionalProperties: false,
}

export default defineEventHandler(async (event): Promise<ProcessReceiptResponse> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const receiptId = getRouterParam(event, 'id')!
  const db = useDb()
  const supabaseAdmin = useSupabaseAdmin()
  const claude = useAnthropicClient()
  const voyage = useVoyageClient()

  // Load receipt
  const receiptRows = await db.select().from(receipts)
    .where(and(eq(receipts.id, receiptId), eq(receipts.userId, user.id)))
  const receipt = receiptRows[0]

  if (!receipt) throw createError({ statusCode: 404, message: 'Receipt not found' })

  // Mark as processing
  await db.update(receipts).set({ processingStatus: 'processing' }).where(eq(receipts.id, receiptId))

  try {
    // --- Step 1: Claude extraction ---
    let extractedData: any

    const messages: Anthropic.MessageParam[] = []

    if (receipt.imageUrl) {
      // Fetch image from Supabase Storage as base64
      const urlParts = receipt.imageUrl.split('/storage/v1/object/public/receipts/')
      const storagePath = urlParts[1] ?? ''

      const { data: imageData, error } = await supabaseAdmin.storage
        .from('receipts')
        .download(storagePath)

      if (error || !imageData) throw new Error(`Failed to fetch image: ${error?.message}`)

      const arrayBuffer = await imageData.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')

      messages.push({
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
          },
          { type: 'text', text: 'Extract all receipt data. For receipt_datetime use ISO 8601. If date not shown use today. Quantities default to 1.' },
        ],
      })
    } else if (receipt.rawText) {
      messages.push({
        role: 'user',
        content: receipt.rawText,
      })
    }

    const claudeResponse = await claude.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      system: `You are a receipt data extraction specialist. Extract structured data from receipts.
- raw_name: exact text on receipt
- generalized_name: normalized human-readable name (e.g. "2% Milk 1L" not "MLK 2% 1LT SKU#4821")
- Remove store codes, normalize spacing
- Assign the most specific applicable category
- If a field is missing from the receipt, omit it from the JSON`,
      messages,
      tools: [
        {
          name: 'extract_receipt',
          description: 'Extract structured receipt data',
          input_schema: RECEIPT_SCHEMA as any,
        },
      ],
      tool_choice: { type: 'any' },
    })

    // Extract tool use result
    const toolUse = claudeResponse.content.find((b: Anthropic.ContentBlock) => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined
    if (!toolUse) throw new Error('Claude did not return structured data')
    extractedData = toolUse.input as any

    // --- Step 2: Update receipt metadata ---
    await db.update(receipts).set({
      storeName: extractedData.store_name,
      storeAddress: extractedData.store_address || null,
      receiptDatetime: new Date(extractedData.receipt_datetime),
      subtotal: extractedData.subtotal?.toString() || null,
      taxTotal: extractedData.tax_total?.toString() || null,
      total: extractedData.total.toString(),
    }).where(eq(receipts.id, receiptId))

    // --- Step 3: Voyage AI embeddings ---
    const items = extractedData.items || []

    // Batch embed all item names
    const textsToEmbed = items.map((item: any) =>
      [item.generalized_name, item.brand_name].filter(Boolean).join(' '),
    )

    let embeddings: number[][] = []
    if (textsToEmbed.length > 0) {
      const embeddingResult = await voyage.embed({
        input: textsToEmbed,
        model: 'voyage-3-lite',
      })
      embeddings = embeddingResult.data?.map((d: any) => d.embedding as number[]) || []
    }

    // --- Step 4: Load categories for lookup ---
    const allCategories = await db.select().from(categories)
    const categoryMap = new Map(allCategories.map((c: typeof allCategories[0]) => [c.name, c]))

    // --- Step 5: For each item, find similar historical items and compute price indicator ---
    const insertedItems = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const embedding = embeddings[i] || null
      const category = categoryMap.get(item.category)

      let priceIndicator: string | null = null
      let pricePercentDiff: number | null = null
      let historicalAvgPrice: number | null = null
      let similarItemsCount = 0

      if (embedding && embedding.length > 0) {
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
