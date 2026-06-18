export function useReceipt() {
  const uploading = ref(false)
  const processing = ref(false)
  const error = ref<string | null>(null)

  async function uploadAndProcess(input: File | Blob | string): Promise<string | null> {
    error.value = null
    uploading.value = true

    try {
      let receiptId: string

      if (typeof input === 'string') {
        const res = await $fetch<{ receiptId: string }>('/api/receipts', {
          method: 'POST',
          body: { text: input },
        })
        receiptId = res.receiptId
      } else {
        const formData = new FormData()
        formData.append('image', input, 'receipt.jpg')
        const res = await $fetch<{ receiptId: string }>('/api/receipts', {
          method: 'POST',
          body: formData,
        })
        receiptId = res.receiptId
      }

      uploading.value = false
      processing.value = true

      await $fetch(`/api/receipts/${receiptId}/process`, { method: 'POST' })

      return receiptId
    } catch (e: any) {
      error.value = e.message || 'Failed to process receipt'
      return null
    } finally {
      uploading.value = false
      processing.value = false
    }
  }

  return { uploading, processing, error, uploadAndProcess }
}
