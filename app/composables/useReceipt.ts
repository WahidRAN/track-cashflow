export function useReceipt() {
  const uploading = ref(false)
  const processing = ref(false)
  const error = ref<string | null>(null)

  /**
   * Create a receipt from text or an image, then run extraction. Resolves to the receipt id
   * (also when the server reports it's already being processed), or null on failure.
   */
  async function uploadAndProcess(
    input: File | Blob | string,
    inputMethod: ImageInputMethod = 'upload',
  ): Promise<string | null> {
    error.value = null
    uploading.value = true

    try {
      const receiptId = await createReceipt(typeof input === 'string' ? input : { image: input, inputMethod })

      uploading.value = false
      processing.value = true

      // 'already-processing' (409) is fine: the receipt page shows the result once it's done
      await processReceipt(receiptId)

      return receiptId
    } catch (e) {
      error.value = getErrorMessage(e, 'Failed to process receipt')
      return null
    } finally {
      uploading.value = false
      processing.value = false
    }
  }

  return { uploading, processing, error, uploadAndProcess }
}
