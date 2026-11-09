import { serverSupabaseUser } from '#supabase/server'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { useDb } from '~/server/utils/db'
import { receipts } from '~/db/schema'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const supabaseAdmin = useSupabaseAdmin()
  const contentType = getHeader(event, 'content-type') || ''
  const db = useDb()
  const receiptId = crypto.randomUUID()

  let imageUrl: string | null = null
  let rawText: string | null = null
  let inputMethod: string = 'text'

  if (contentType.includes('multipart/form-data')) {
    // Handle image upload
    const formData = await readMultipartFormData(event)
    const imageFile = formData?.find(f => f.name === 'image')
    const textField = formData?.find(f => f.name === 'text')

    if (imageFile?.data) {
      inputMethod = imageFile.filename ? 'upload' : 'camera'
      const path = `${user.id}/${receiptId}/original.jpg`

      const { error } = await supabaseAdmin.storage
        .from('receipts')
        .upload(path, imageFile.data, {
          contentType: imageFile.type || 'image/jpeg',
          upsert: false,
        })

      if (error) {
        throw createError({ statusCode: 500, message: `Storage upload failed: ${error.message}` })
      }

      const { data: urlData } = supabaseAdmin.storage.from('receipts').getPublicUrl(path)
      imageUrl = urlData.publicUrl
    }

    if (textField?.data) {
      rawText = textField.data.toString('utf-8')
    }
  } else {
    // JSON body — text-only input
    const body = await readBody(event)
    rawText = body?.text || null
    inputMethod = 'text'
  }

  if (!imageUrl && !rawText) {
    throw createError({ statusCode: 400, message: 'Provide either an image or text' })
  }

  // Create receipt record in pending state
  await db.insert(receipts).values({
    id: receiptId,
    userId: user.id,
    storeName: 'Processing...',
    receiptDatetime: new Date(),
    total: '0',
    imageUrl,
    rawText,
    inputMethod,
    processingStatus: 'pending',
  })

  return { receiptId, imageUrl }
})
