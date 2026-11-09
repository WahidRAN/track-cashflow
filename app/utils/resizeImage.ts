/**
 * Downscale an image on the client before upload.
 *
 * Phone photos (12MP, 3–8MB) are slow or OOM for local vision models and can
 * exceed Claude's ~5MB image limit. This scales the longest side down to
 * `maxSide` (never upscales), honours EXIF orientation, and re-encodes as JPEG.
 *
 * Never throws: on any failure (unsupported format, no canvas, SSR) the
 * original blob is returned unchanged.
 */
export async function resizeImage(file: Blob, maxSide = 1600, quality = 0.85): Promise<Blob> {
  if (typeof document === 'undefined') return file

  let bitmap: ImageBitmap | null = null
  let objectUrl: string | null = null

  try {
    let source: CanvasImageSource
    let width: number
    let height: number

    try {
      if (typeof createImageBitmap !== 'function') throw new Error('createImageBitmap unavailable')
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      source = bitmap
      width = bitmap.width
      height = bitmap.height
    } catch {
      objectUrl = URL.createObjectURL(file)
      const img = await loadImage(objectUrl)
      source = img
      // naturalWidth/Height respect EXIF orientation in modern browsers (image-orientation: from-image default)
      width = img.naturalWidth
      height = img.naturalHeight
    }

    if (!width || !height) return file

    const scale = Math.min(1, maxSide / Math.max(width, height))
    const targetW = Math.max(1, Math.round(width * scale))
    const targetH = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    // JPEG has no alpha: paint white so transparent PNGs don't turn black
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, targetW, targetH)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, targetW, targetH)

    const out = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality)
    })

    // Release canvas backing memory promptly (matters on low-RAM phones)
    canvas.width = 0
    canvas.height = 0

    if (!out) return file
    // If no downscale was needed and re-encoding made it bigger, keep a JPEG original as-is
    if (scale === 1 && file.type === 'image/jpeg' && out.size >= file.size) return file
    return out
  } catch {
    return file
  } finally {
    bitmap?.close()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to decode image'))
    img.src = src
  })
}
