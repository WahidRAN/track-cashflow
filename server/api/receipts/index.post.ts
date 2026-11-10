import { requireUserId } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { useDb } from '~/server/utils/db'
import { badRequest, pgErrorCode } from '~/server/utils/request'
import { RECEIPTS_BUCKET, receiptImageUrl, receiptStoragePath } from '~/server/utils/receiptDto'
import { profiles, receipts } from '~/db/schema'
import type { CreateReceiptResponse } from '~/types/api'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_TEXT_CHARS = 20_000

/** Detect the image type from magic bytes — never trust the client's content-type for what we serve back */
function sniffImage(data: Buffer): { mime: string, ext: string } | null {
  if (data.length >= 3 && data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) return { mime: 'image/jpeg', ext: 'jpg' }
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return { mime: 'image/png', ext: 'png' }
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  if (data.length >= 6 && data.toString('ascii', 0, 3) === 'GIF') return { mime: 'image/gif', ext: 'gif' }
  return null
}

/**
 * Create a pending receipt from either
 *   - multipart/form-data: `image` (file), optional `text`, optional `inputMethod` ('camera' | 'upload')
 *   - JSON: { text }
 * Then call POST /api/receipts/:id/process.
 */
export default defineEventHandler(async (event): Promise<CreateReceiptResponse> => {
  const userId = await requireUserId(event)
  const db = useDb()
  const contentType = getHeader(event, 'content-type') || ''
  const receiptId = crypto.randomUUID()

  let image: { data: Buffer, mime: string, ext: string } | null = null
  let rawText: string | null = null
  let inputMethod: 'camera' | 'upload' | 'text' = 'text'

  if (contentType.includes('multipart/form-data')) {
    const formData = await readMultipartFormData(event)
    const imageFile = formData?.find(f => f.name === 'image' && f.data?.length)
    const textField = formData?.find(f => f.name === 'text')
    const methodField = formData?.find(f => f.name === 'inputMethod')

    if (imageFile) {
      if (imageFile.data.length > MAX_IMAGE_BYTES) {
        throw createError({ statusCode: 413, statusMessage: 'Payload Too Large', message: 'Image is larger than 10 MB' })
      }
      const sniffed = sniffImage(imageFile.data)
      if (!sniffed) {
        throw createError({ statusCode: 415, statusMessage: 'Unsupported Media Type', message: 'Image must be JPEG, PNG, WebP or GIF' })
      }
      image = { data: imageFile.data, ...sniffed }
      // Browsers always send a filename for FormData blobs, so the client says which it was
      inputMethod = methodField?.data.toString('utf-8').trim() === 'camera' ? 'camera' : 'upload'
    }
    const text = textField?.data.toString('utf-8').trim()
    if (text) rawText = text
  }
  else {
    const body = await readBody<{ text?: unknown } | null>(event).catch(() => null)
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    if (text) rawText = text
  }

  if (!image && !rawText) throw badRequest('Provide either an image or text')
  if (rawText && rawText.length > MAX_TEXT_CHARS) throw badRequest(`Text is too long (max ${MAX_TEXT_CHARS} characters)`)

  // receipts.user_id → profiles.id. The auth.users trigger normally creates the
  // profile; make sure it exists so a missed trigger can't cause an FK error.
  try {
    await db.insert(profiles).values({ id: userId }).onConflictDoNothing()
  }
  catch (err) {
    // profiles.id → auth.users.id: a valid JWT for a user that no longer exists (e.g. after `supabase db reset`)
    if (pgErrorCode(err) === '23503') {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Your account no longer exists — please sign in again' })
    }
    throw err
  }

  let storagePath: string | null = null
  if (image) {
    storagePath = receiptStoragePath(userId, receiptId, image.ext)
    const { error } = await useSupabaseAdmin().storage
      .from(RECEIPTS_BUCKET)
      .upload(storagePath, image.data, { contentType: image.mime, upsert: false })
    if (error) {
      throw createError({ statusCode: 500, message: `Storage upload failed: ${error.message}` })
    }
  }

  try {
    await db.insert(receipts).values({
      id: receiptId,
      userId,
      storeName: 'Processing...',
      receiptDatetime: new Date(),
      total: '0',
      imageUrl: storagePath,
      rawText,
      inputMethod,
      processingStatus: 'pending',
    })
  }
  catch (err) {
    if (storagePath) await useSupabaseAdmin().storage.from(RECEIPTS_BUCKET).remove([storagePath]).catch(() => {})
    throw err
  }

  setResponseStatus(event, 201)
  return { receiptId, imageUrl: storagePath ? receiptImageUrl(receiptId) : null }
})
