// Pure helpers for item-name normalization and price comparison.
// No Nuxt/Nitro globals in here so they can be unit tested in isolation.

export type PriceIndicator = 'cheaper' | 'similar' | 'expensive'

export interface PriceComparison {
  priceIndicator: PriceIndicator | null
  pricePercentDiff: number | null
  historicalAvgPrice: number | null
  /** Number of previous purchases (same generalized name) the average is based on */
  similarItemsCount: number
}

/** A price within ±5% of the historical average counts as "similar" */
export const PRICE_SIMILAR_BAND_PCT = 5

// receipt_items.price_percent_diff is NUMERIC(6,2) — clamp so bad data can't overflow it
const MAX_PERCENT_DIFF = 9999.99

/**
 * Compare a unit price with previous unit prices of the same generalized item.
 * Discount / refund lines (unit price <= 0) and items without history get no indicator.
 */
export function computePriceIndicator(unitPrice: number, historyPrices: readonly number[]): PriceComparison {
  const prices = historyPrices.filter(p => Number.isFinite(p) && p > 0)
  if (!Number.isFinite(unitPrice) || unitPrice <= 0 || prices.length === 0) {
    return { priceIndicator: null, pricePercentDiff: null, historicalAvgPrice: null, similarItemsCount: 0 }
  }

  const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length
  const diffPct = ((unitPrice - avg) / avg) * 100

  return {
    priceIndicator: diffPct < -PRICE_SIMILAR_BAND_PCT
      ? 'cheaper'
      : diffPct > PRICE_SIMILAR_BAND_PCT ? 'expensive' : 'similar',
    pricePercentDiff: Math.min(MAX_PERCENT_DIFF, Math.round(diffPct * 10) / 10),
    historicalAvgPrice: Math.round(avg * 100) / 100,
    similarItemsCount: prices.length,
  }
}

// ---------------------------------------------------------------------------
// Generalized name normalization
// ---------------------------------------------------------------------------
//
// Price history is matched on the EXACT generalized name, so the same product
// type + size must always produce the same string regardless of brand, store
// or how the AI (or the user) happened to spell the unit:
//   "Milk 1L", "milk 1 liter", "milk 1000 ml"  → "milk 1 litre"
//   "milk 500 ml", "milk 0.5l"                 → "milk 500ml"
//   "chicken 0.5 kg", "chicken 500 g"          → "chicken 500g"
//   "eggs 10 pcs", "eggs 10個"                 → "eggs 10 pieces"
//
// Sizes are canonicalized: whole litres / kilograms are written as "N litre" /
// "Nkg", everything else in ml / g.

const NUM = String.raw`(\d+(?:\.\d+)?)`
// (?<![\d.]) — don't start matching in the middle of a number
// (?![a-z])  — the unit must end the word ("1 lemon" is not "1 l")
const VOLUME_RE = new RegExp(
  String.raw`(?<![\d.])${NUM}\s*(ml|mls|millilit(?:re|er)s?|l|lt(?:rs?)?|lit(?:re|er)s?)(?![a-z])`,
  'g',
)
const WEIGHT_RE = new RegExp(
  String.raw`(?<![\d.])${NUM}\s*(kg|kgs|kilos?|kilogram(?:me)?s?|g|gr|grams?|grammes?)(?![a-z])`,
  'g',
)
const COUNT_RE = /(?<![\d.])(\d+)\s*(?:pcs|pc|pieces?|p|個入り?|個|入り?)(?![a-z])/g

function formatAmount(n: number): string {
  return String(Math.round(n * 1000) / 1000)
}

function formatVolume(ml: number): string {
  const rounded = Math.round(ml * 1000) / 1000
  return rounded >= 1000 && rounded % 1000 === 0
    ? `${formatAmount(rounded / 1000)} litre`
    : `${formatAmount(rounded)}ml`
}

function formatWeight(grams: number): string {
  const rounded = Math.round(grams * 1000) / 1000
  return rounded >= 1000 && rounded % 1000 === 0
    ? `${formatAmount(rounded / 1000)}kg`
    : `${formatAmount(rounded)}g`
}

/**
 * Canonical form of an item's generalized name: lowercase, trimmed, single
 * spaces, consistent size units. Idempotent.
 */
export function normalizeGeneralizedName(name: string): string {
  let s = name
    .normalize('NFKC') // full-width "１Ｌ" → "1L", "㎖" → "mL"
    .toLowerCase()
    .replace(/[×✕]/g, ' x ')
    .replace(/\s+/g, ' ')
    .trim()

  s = s.replace(VOLUME_RE, (_m, n: string, unit: string) =>
    formatVolume(unit.startsWith('m') ? Number(n) : Number(n) * 1000))
  s = s.replace(WEIGHT_RE, (_m, n: string, unit: string) =>
    formatWeight(unit.startsWith('k') ? Number(n) * 1000 : Number(n)))
  s = s.replace(COUNT_RE, '$1 pieces')
  s = s.replace(/\bpcs\b/g, 'pieces')
  // Multipacks: "200mlx6" / "6×200ml" → "200ml x 6" / "6 x 200ml"
  s = s.replace(/(\d|ml|g|kg|litre|pieces)\s*x\s*(?=\d)/g, '$1 x ')

  return s.replace(/\s+/g, ' ').trim()
}
