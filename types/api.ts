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
  priceIndicator: 'cheaper' | 'similar' | 'expensive' | null
  pricePercentDiff: number | null
  historicalAvgPrice: number | null
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
  receiptDatetime?: string
  subtotal?: number | null
  taxTotal?: number | null
  total?: number
}

export interface UpdateItemBody {
  generalizedName?: string
  brandName?: string | null
  quantity?: number
  unitPrice?: number
  lineTotal?: number
  taxAmount?: number
  categoryName?: string
}
