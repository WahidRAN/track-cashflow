import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  integer,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  icon: text('icon'),
  color: text('color'),
})

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name'),
  currency: text('currency').default('USD').notNull(),
  timezone: text('timezone').default('UTC').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const receipts = pgTable('receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  storeName: text('store_name').notNull(),
  storeAddress: text('store_address'),
  receiptDatetime: timestamp('receipt_datetime', { withTimezone: true }).notNull(),
  subtotal: numeric('subtotal', { precision: 10, scale: 2 }),
  taxTotal: numeric('tax_total', { precision: 10, scale: 2 }),
  total: numeric('total', { precision: 10, scale: 2 }).notNull(),
  imageUrl: text('image_url'),
  rawText: text('raw_text'),
  inputMethod: text('input_method').notNull().default('camera'),
  processingStatus: text('processing_status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const receiptItems = pgTable(
  'receipt_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    receiptId: uuid('receipt_id').notNull().references(() => receipts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    rawName: text('raw_name').notNull(),
    generalizedName: text('generalized_name').notNull(),
    brandName: text('brand_name'),
    quantity: numeric('quantity', { precision: 6, scale: 2 }).default('1'),
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
    lineTotal: numeric('line_total', { precision: 10, scale: 2 }).notNull(),
    taxAmount: numeric('tax_amount', { precision: 10, scale: 2 }).default('0'),
    categoryId: uuid('category_id').references(() => categories.id),
    categoryName: text('category_name'),
    // embedding stored as text for pgvector - actual vector type needs raw SQL migration
    embeddingText: text('embedding_text'), // placeholder; real column is vector(1024) via SQL migration
    priceIndicator: text('price_indicator'),
    pricePercentDiff: numeric('price_percent_diff', { precision: 6, scale: 2 }),
    historicalAvgPrice: numeric('historical_avg_price', { precision: 10, scale: 2 }),
    similarItemsCount: integer('similar_items_count').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('receipt_items_user_id_idx').on(table.userId),
    receiptIdIdx: index('receipt_items_receipt_id_idx').on(table.receiptId),
    categoryIdx: index('receipt_items_category_idx').on(table.categoryId),
  }),
)
