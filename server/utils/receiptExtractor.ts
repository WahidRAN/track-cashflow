import type Anthropic from '@anthropic-ai/sdk'
import { useAnthropicClient } from '~/server/utils/claude'
import { normalizeGeneralizedName } from '~/server/utils/pricing'
import { DEFAULT_TIMEZONE, formatDateInZone, parseDateTimeInZone } from '~/server/utils/datetime'
import { MAX_MONEY, MAX_QUANTITY } from '~/server/utils/request'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const RECEIPT_CATEGORIES = [
  'Groceries', 'Personal Care', 'Household', 'Pharmacy', 'Restaurant', 'Coffee',
  'Clothing', 'Electronics', 'Transportation', 'Entertainment', 'Other',
] as const

export type ReceiptCategory = typeof RECEIPT_CATEGORIES[number]

export type AiProvider = 'claude' | 'ollama'

export interface ExtractedReceiptItem {
  raw_name: string
  /** Normalized with normalizeGeneralizedName() — the price-history match key */
  generalized_name: string
  brand_name?: string
  quantity: number
  unit_price: number
  line_total: number
  tax_amount: number
  category: ReceiptCategory
}

export interface ExtractedReceipt {
  store_name: string
  store_address?: string
  /** ISO 8601 UTC instant — the receipt's local time read in the receipt timezone */
  receipt_datetime: string
  subtotal?: number
  tax_total?: number
  total: number
  items: ExtractedReceiptItem[]
}

export interface ExtractReceiptInput {
  imageBase64?: string
  /** MIME type of the image (e.g. Blob.type). Falls back to image/jpeg. */
  mediaType?: string
  text?: string
  /** IANA timezone the receipt's printed (local) time is in. Default Asia/Tokyo. */
  timezone?: string
  /** Current time (for "today" and sanity checks); injectable for tests */
  now?: Date
}

export interface NormalizeOptions {
  timezone?: string
  now?: Date
}

// ---------------------------------------------------------------------------
// Schema + prompt (shared by all providers)
// ---------------------------------------------------------------------------

// JSON schema used as Claude's tool input_schema and as Ollama's `format`
export const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    store_name: { type: 'string' },
    store_address: { type: 'string' },
    receipt_datetime: {
      type: 'string',
      description: 'Local date/time as printed on the receipt, ISO 8601 WITHOUT timezone offset, e.g. 2025-01-05T14:32:00',
    },
    subtotal: { type: 'number' },
    tax_total: { type: 'number' },
    total: { type: 'number' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          raw_name: { type: 'string', description: 'Exact text from receipt (keep original Japanese)' },
          generalized_name: {
            type: 'string',
            description: 'Lowercase English, brand removed, product type + size, e.g. "milk 1 litre", "milk 500ml", "eggs 10 pieces"',
          },
          brand_name: { type: 'string' },
          quantity: { type: 'number' },
          unit_price: { type: 'number' },
          line_total: { type: 'number' },
          tax_amount: { type: 'number' },
          category: {
            type: 'string',
            enum: [...RECEIPT_CATEGORIES],
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

export const SYSTEM_PROMPT = `You are a receipt data extraction specialist. Extract structured data from receipts.
Receipts are mostly Japanese (e.g. Gyomu Super / 業務スーパー, Welcia / ウエルシア, Lopia / ロピア). Prices are in Japanese yen (integers, no decimals). Consumption tax of 8% (food, marked e.g. ※ or 軽) or 10% may appear; tax may be included (内税) or added (外税).

Field rules:
- raw_name: the exact item text as printed on the receipt, keeping the original Japanese.
- generalized_name: lowercase English, brand removed, product type + size/amount when known. It is used to compare prices across brands and stores, so the same kind of product in the same size MUST get the identical text (e.g. "midori milk 1L" at Gyomu Super and another brand's 1L milk at Lopia are both "milk 1 litre"). Use the simplest common product name. Size formats: "1 litre" (whole litres), "500ml", "1kg" (whole kilograms), "500g", "10 pieces", "12 rolls". Examples: "milk 1 litre", "milk 500ml", "eggs 10 pieces", "chicken breast 500g", "rice 5kg", "toilet paper 12 rolls". Never include brand names, store codes, or Japanese text in this field.
- brand_name: the brand if identifiable, otherwise omit.
- quantity: number of units (default 1). unit_price: price per unit in yen. line_total: total for the line in yen.
- Discounts (値引 / 割引) apply to the item above them; reflect them in that item's line_total when clear.
- Numbers must be plain JSON numbers (198, not "¥198" or "1,280").
- total: the final amount paid (合計). subtotal (小計) and tax_total (消費税等) when shown.
- receipt_datetime: the local date and time exactly as printed, ISO 8601 without a timezone offset (e.g. "2025-01-05T14:32:00"). Japanese receipts may use 2025年1月5日 or Reiwa era dates (令和7年 = 2025). If only a date is printed, use 00:00 for the time.
- Assign the most specific applicable category.
- Remove store codes, normalize spacing.
- If a field is missing from the receipt, omit it from the JSON.`

const IMAGE_INSTRUCTION = 'Extract all receipt data. For receipt_datetime use the printed local time in ISO 8601 without offset. If no date is shown use today\'s date. Quantities default to 1.'

/** System prompt plus today's date — the model can't know it otherwise (missing dates / years) */
export function buildSystemPrompt(now: Date, timezone: string): string {
  return `${SYSTEM_PROMPT}\n\nToday's date is ${formatDateInZone(now, timezone)} (receipts are in the ${timezone} timezone).`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getAiProvider(): AiProvider {
  const config = useRuntimeConfig()
  const provider = String(config.aiProvider || 'claude').trim().toLowerCase()
  if (provider !== 'claude' && provider !== 'ollama') {
    throw new Error(`Unknown AI_PROVIDER "${provider}" (expected "claude" or "ollama")`)
  }
  return provider
}

/**
 * Extract structured receipt data from an image or raw text using the
 * provider configured in runtimeConfig.aiProvider. Output is normalized.
 */
export async function extractReceipt(input: ExtractReceiptInput): Promise<ExtractedReceipt> {
  if (!input.imageBase64 && !input.text) {
    throw new Error('Receipt has no image or text to extract from')
  }
  const provider = getAiProvider()
  const timezone = input.timezone || DEFAULT_TIMEZONE
  const now = input.now ?? new Date()
  const systemPrompt = buildSystemPrompt(now, timezone)
  const raw = provider === 'ollama'
    ? await extractWithOllama(input, systemPrompt)
    : await extractWithClaude(input, systemPrompt)
  return normalizeExtractedReceipt(raw, { timezone, now })
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

type ClaudeImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const CLAUDE_MEDIA_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function toClaudeMediaType(mediaType?: string): ClaudeImageMediaType {
  const t = (mediaType || '').toLowerCase().split(';')[0]!.trim()
  if (t === 'image/jpg') return 'image/jpeg'
  return (CLAUDE_MEDIA_TYPES.includes(t) ? t : 'image/jpeg') as ClaudeImageMediaType
}

async function extractWithClaude(input: ExtractReceiptInput, systemPrompt: string): Promise<unknown> {
  const config = useRuntimeConfig()
  const claude = useAnthropicClient()

  const messages: Anthropic.MessageParam[] = []
  if (input.imageBase64) {
    messages.push({
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: toClaudeMediaType(input.mediaType), data: input.imageBase64 },
        },
        { type: 'text', text: IMAGE_INSTRUCTION },
      ],
    })
  }
  else {
    messages.push({ role: 'user', content: input.text! })
  }

  const response = await claude.messages.create({
    model: String(config.claudeModel || 'claude-opus-4-5'),
    // Long supermarket receipts (40+ lines) don't fit in 4096 output tokens
    max_tokens: 8192,
    system: systemPrompt,
    messages,
    tools: [
      {
        name: 'extract_receipt',
        description: 'Extract structured receipt data',
        input_schema: RECEIPT_SCHEMA as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'any' },
  })

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  )
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Receipt too long: Claude ran out of output tokens before finishing')
  }
  if (!toolUse) throw new Error('Claude did not return structured data')
  return toolUse.input
}

interface OllamaChatResponse {
  message?: { content?: string }
  error?: string
}

const OLLAMA_TIMEOUT_MS = 180_000

async function extractWithOllama(input: ExtractReceiptInput, systemPrompt: string): Promise<unknown> {
  const config = useRuntimeConfig()
  const baseUrl = String(config.ollamaBaseUrl || 'http://localhost:11434').replace(/\/+$/, '')
  const model = String(config.ollamaModel || 'qwen2.5vl:7b')

  const userMessage: { role: 'user'; content: string; images?: string[] } = input.imageBase64
    ? { role: 'user', content: IMAGE_INSTRUCTION, images: [input.imageBase64] }
    : { role: 'user', content: input.text! }

  let response: OllamaChatResponse
  try {
    response = await $fetch<OllamaChatResponse>(`${baseUrl}/api/chat`, {
      method: 'POST',
      timeout: OLLAMA_TIMEOUT_MS,
      retry: 0,
      body: {
        model,
        stream: false,
        format: RECEIPT_SCHEMA,
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: systemPrompt },
          userMessage,
        ],
      },
    })
  }
  catch (err: any) {
    const status: number | undefined = err?.response?.status ?? err?.statusCode
    if (status) {
      const detail = err?.data?.error || err?.response?._data?.error || err?.message
      throw new Error(`Ollama at ${baseUrl} returned ${status} for model "${model}": ${detail}`)
    }
    const name = err?.name || err?.cause?.name
    if (name === 'TimeoutError' || name === 'AbortError' || /timeout|aborted/i.test(String(err?.message))) {
      throw new Error(`Ollama at ${baseUrl} timed out after ${OLLAMA_TIMEOUT_MS / 1000}s (model "${model}")`)
    }
    throw new Error(`Cannot reach Ollama at ${baseUrl} — is it running? (${err?.cause?.code || err?.message || 'network error'})`)
  }

  if (response?.error) throw new Error(`Ollama error: ${response.error}`)
  const content = response?.message?.content
  if (!content) throw new Error('Ollama returned an empty response')

  try {
    return JSON.parse(content)
  }
  catch {
    // Some models wrap JSON in prose / code fences — try the outermost object
    const match = content.match(/\{[\s\S]*\}/)
    if (match) {
      try { return JSON.parse(match[0]) }
      catch { /* fall through */ }
    }
    throw new Error(`Ollama returned invalid JSON: ${content.slice(0, 200)}`)
  }
}

// ---------------------------------------------------------------------------
// Normalization (small local models are sloppy)
// ---------------------------------------------------------------------------

/** Coerce "¥198", "1,280", "１２８０円", 198 → number; anything else → undefined */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const cleaned = value.normalize('NFKC').replace(/[−–—]/g, '-').replace(/[^0-9.\-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

function toStr(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const s = String(value).trim()
  return s || undefined
}

const CATEGORY_LOOKUP = new Map(RECEIPT_CATEGORIES.map(c => [c.toLowerCase(), c]))

function toCategory(value: unknown): ReceiptCategory {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return CATEGORY_LOOKUP.get(key) ?? 'Other'
}

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000

/**
 * The AI reports the receipt's printed local time. Any offset it adds is
 * invented ("Z" is common), so it's discarded and the wall time is read in
 * the receipt timezone. Unparsable or implausible dates fall back to now.
 */
function toIsoDatetime(value: unknown, timezone: string, now: Date): string {
  const d = typeof value === 'string' ? parseDateTimeInZone(value, timezone, { ignoreOffset: true }) : null
  // Year < 2000 = era year read as AD (令和7 → 0007); far future = misread digits
  if (!d || d.getUTCFullYear() < 2000 || d.getTime() > now.getTime() + TWO_DAYS_MS) return now.toISOString()
  return d.toISOString()
}

/** Money within the NUMERIC(10,2) column range, else undefined (e.g. a barcode read as a price) */
function toMoney(value: unknown): number | undefined {
  const n = toNumber(value)
  return n !== undefined && Math.abs(n) <= MAX_MONEY ? n : undefined
}

export function normalizeExtractedReceipt(raw: unknown, opts: NormalizeOptions = {}): ExtractedReceipt {
  const timezone = opts.timezone || DEFAULT_TIMEZONE
  const now = opts.now ?? new Date()
  if (!raw || typeof raw !== 'object') throw new Error('AI returned no receipt data')
  const data = raw as Record<string, unknown>

  if (!Array.isArray(data.items)) throw new Error('AI response is missing an items array')

  const total = toMoney(data.total)
  if (total === undefined) throw new Error('AI response has no valid receipt total')

  const items: ExtractedReceiptItem[] = []
  for (const entry of data.items) {
    if (!entry || typeof entry !== 'object') continue
    const it = entry as Record<string, unknown>

    const rawName = toStr(it.raw_name)
    const generalizedName = toStr(it.generalized_name)
    const name = rawName ?? generalizedName
    if (!name) continue

    const quantity = (() => {
      const q = toNumber(it.quantity)
      return q !== undefined && q > 0 && q <= MAX_QUANTITY ? q : 1
    })()
    let unitPrice = toMoney(it.unit_price)
    let lineTotal = toMoney(it.line_total)
    if (unitPrice === undefined && lineTotal === undefined) continue
    if (unitPrice === undefined) unitPrice = Math.round((lineTotal! / quantity) * 100) / 100
    if (lineTotal === undefined) lineTotal = Math.round(unitPrice * quantity * 100) / 100
    if (Math.abs(lineTotal) > MAX_MONEY) continue

    items.push({
      raw_name: name,
      generalized_name: normalizeGeneralizedName(generalizedName ?? name) || name.toLowerCase(),
      brand_name: toStr(it.brand_name),
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
      tax_amount: toMoney(it.tax_amount) ?? 0,
      category: toCategory(it.category),
    })
  }

  return {
    store_name: toStr(data.store_name) ?? 'Unknown store',
    store_address: toStr(data.store_address),
    receipt_datetime: toIsoDatetime(data.receipt_datetime, timezone, now),
    subtotal: toMoney(data.subtotal),
    tax_total: toMoney(data.tax_total),
    total,
    items,
  }
}
