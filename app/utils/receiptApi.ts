/**
 * Client calls for creating and processing receipts (shared by capture.vue and useReceipt).
 */

export type ImageInputMethod = 'camera' | 'upload'

/**
 * `x-timezone` header with the browser's IANA zone. The server uses it to read times printed on
 * the receipt without an offset ("2025/01/05 14:32"); it falls back to Asia/Tokyo without it.
 */
export function timeZoneHeaders(): Record<string, string> {
  if (import.meta.server) return {}
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz ? { 'x-timezone': tz } : {}
  } catch {
    return {}
  }
}

function statusOf(e: unknown): number | undefined {
  const err = e as { statusCode?: number, status?: number, response?: { status?: number } } | null
  return err?.statusCode ?? err?.status ?? err?.response?.status
}

/**
 * Create a receipt from free text or an image. Images are downscaled first and tagged with how
 * they were captured (browsers always send a filename, so the server can't tell otherwise).
 */
export async function createReceipt(
  input: string | { image: Blob, inputMethod: ImageInputMethod },
): Promise<string> {
  let body: FormData | { text: string }
  if (typeof input === 'string') {
    body = { text: input }
  } else {
    // Downscale big phone photos (local vision models + Claude's ~5MB limit)
    const resized = await resizeImage(input.image)
    const form = new FormData()
    form.append('image', resized, 'receipt.jpg')
    form.append('inputMethod', input.inputMethod)
    body = form
  }
  const res = await $fetch<{ receiptId: string }>('/api/receipts', {
    method: 'POST',
    body,
    headers: timeZoneHeaders(),
  })
  return res.receiptId
}

/**
 * Run AI extraction for a receipt. A 409 means another request (double tap, second tab) is
 * already processing it: that's not a failure, the result will show up on the receipt page.
 */
export async function processReceipt(receiptId: string): Promise<'processed' | 'already-processing'> {
  try {
    await $fetch(`/api/receipts/${receiptId}/process`, {
      method: 'POST',
      headers: timeZoneHeaders(),
    })
    return 'processed'
  } catch (e) {
    if (statusOf(e) === 409) return 'already-processing'
    throw e
  }
}
