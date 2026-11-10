export interface Category {
  id: string
  name: string
  icon: string | null
  color: string | null
}

export interface ReceiptItem {
  id: string
  receiptId: string
  rawName: string
  generalizedName: string
  brandName: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
  taxAmount: number
  categoryId: string | null
  categoryName: string | null
  /** Compared with the user's previous purchases of the same generalizedName (±5% = similar) */
  priceIndicator: 'cheaper' | 'similar' | 'expensive' | null
  /** % difference from historicalAvgPrice, e.g. -12.5 */
  pricePercentDiff: number | null
  /** Average unit price of previous purchases with the same generalizedName */
  historicalAvgPrice: number | null
  /** Number of previous purchases the average is based on (0 = no history) */
  similarItemsCount: number
  createdAt: string
}

export interface Receipt {
  id: string
  userId: string
  storeName: string
  storeAddress: string | null
  receiptDatetime: string
  subtotal: number | null
  taxTotal: number | null
  total: number
  /**
   * Same-origin URL of the receipt image (`/api/receipts/<id>/image`), or null.
   * Use directly as <img src>; the session cookie authenticates it.
   */
  imageUrl: string | null
  rawText: string | null
  inputMethod: 'camera' | 'upload' | 'text'
  processingStatus: 'pending' | 'processing' | 'done' | 'error'
  createdAt: string
  updatedAt: string
  items?: ReceiptItem[]
}

export interface ReceiptListResponse {
  data: Receipt[]
  total: number
  page: number
  pageSize: number
}

/** POST /api/receipts */
export interface CreateReceiptResponse {
  receiptId: string
  /** `/api/receipts/<id>/image` when an image was uploaded */
  imageUrl: string | null
}

/** POST /api/receipts/:id/process */
export interface ProcessReceiptResponse {
  receipt: Receipt
  items: ReceiptItem[]
}

export interface MonthlyTotal {
  year: number
  month: number
  total: number
  itemCount: number
  receiptCount: number
}

export interface CategoryTotal {
  categoryId: string
  categoryName: string
  categoryIcon: string | null
  categoryColor: string | null
  total: number
  itemCount: number
}

export interface CashflowResponse {
  months: MonthlyTotal[]
}

export interface CategoryBreakdownResponse {
  categories: CategoryTotal[]
  total: number
  dateFrom: string
  dateTo: string
}

export interface UpdateReceiptBody {
  storeName?: string
  storeAddress?: string | null
  /** ISO 8601. Without an offset it is read in the `x-timezone` header's zone (default Asia/Tokyo). */
  receiptDatetime?: string
  subtotal?: number | null
  taxTotal?: number | null
  total?: number
}

export interface UpdateItemBody {
  /** Normalized server-side ("Milk 1L" → "milk 1 litre"); changing it or unitPrice recomputes the price indicator */
  generalizedName?: string
  brandName?: string | null
  quantity?: number
  unitPrice?: number
  lineTotal?: number
  taxAmount?: number
  /** One of the seeded category names; categoryId is updated to match */
  categoryName?: string | null
}
