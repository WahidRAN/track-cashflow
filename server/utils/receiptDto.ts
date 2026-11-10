import type { receipts, receiptItems } from '~/db/schema'
import type { Receipt, ReceiptItem } from '~/types/api'

// Row → API response mapping, shared by every route that returns receipts/items.

export const RECEIPTS_BUCKET = 'receipts'

type ReceiptRow = typeof receipts.$inferSelect
type ReceiptItemRow = typeof receiptItems.$inferSelect

/**
 * Browser-facing URL of a receipt's image. The bucket is private, so images
 * are streamed by GET /api/receipts/:id/image (auth via the session cookie).
 */
export function receiptImageUrl(receiptId: string): string {
  return `/api/receipts/${receiptId}/image`
}

/** Storage object path: <userId>/<receiptId>/original.<ext> */
export function receiptStoragePath(userId: string, receiptId: string, ext = 'jpg'): string {
  return `${userId}/${receiptId}/original.${ext}`
}

/**
 * `receipts.image_url` holds the storage object path. Rows written before the
 * bucket went private hold a full public URL — take the part after `/receipts/`.
 */
export function toStoragePath(imageUrl: string): string {
  if (!/^https?:\/\//i.test(imageUrl)) return imageUrl.replace(/^\/+/, '')
  const marker = `/${RECEIPTS_BUCKET}/`
  const idx = imageUrl.lastIndexOf(marker)
  const rest = idx >= 0 ? imageUrl.slice(idx + marker.length) : imageUrl
  return decodeURIComponent(rest.split(/[?#]/)[0]!)
}

/** NUMERIC columns come back from postgres-js as strings */
function num(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function toReceiptDto(row: ReceiptRow): Receipt {
  return {
    id: row.id,
    userId: row.userId,
    storeName: row.storeName,
    storeAddress: row.storeAddress ?? null,
    receiptDatetime: row.receiptDatetime.toISOString(),
    subtotal: num(row.subtotal),
    taxTotal: num(row.taxTotal),
    total: num(row.total) ?? 0,
    imageUrl: row.imageUrl ? receiptImageUrl(row.id) : null,
    rawText: row.rawText ?? null,
    inputMethod: row.inputMethod as Receipt['inputMethod'],
    processingStatus: row.processingStatus as Receipt['processingStatus'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toReceiptItemDto(row: ReceiptItemRow): ReceiptItem {
  return {
    id: row.id,
    receiptId: row.receiptId,
    rawName: row.rawName,
    generalizedName: row.generalizedName,
    brandName: row.brandName ?? null,
    quantity: num(row.quantity) ?? 1,
    unitPrice: num(row.unitPrice) ?? 0,
    lineTotal: num(row.lineTotal) ?? 0,
    taxAmount: num(row.taxAmount) ?? 0,
    categoryId: row.categoryId ?? null,
    categoryName: row.categoryName ?? null,
    priceIndicator: (row.priceIndicator as ReceiptItem['priceIndicator']) ?? null,
    pricePercentDiff: num(row.pricePercentDiff),
    historicalAvgPrice: num(row.historicalAvgPrice),
    similarItemsCount: row.similarItemsCount ?? 0,
    createdAt: row.createdAt.toISOString(),
  }
}
