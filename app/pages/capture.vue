<template>
  <NuxtLayout>
    <div class="max-w-lg mx-auto">
      <!-- Header -->
      <div class="px-4 pt-6 pb-4">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Add Receipt</h1>
      </div>

      <!-- Mode tabs -->
      <div class="px-4 mb-4">
        <div class="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors"
            :class="[
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400'
            ]"
            @click="activeTab = tab.id"
          >
            <UIcon :name="tab.icon" class="w-4 h-4" />
            {{ tab.label }}
          </button>
        </div>
      </div>

      <!-- Camera tab -->
      <div v-if="activeTab === 'camera'" class="px-4">
        <div
          v-if="!showCamera"
          class="aspect-[4/3] rounded-2xl bg-gray-900 flex flex-col items-center justify-center gap-4 cursor-pointer"
          @click="showCamera = true"
        >
          <div class="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
            <UIcon name="i-heroicons-camera" class="w-8 h-8 text-white" />
          </div>
          <span class="text-white/70 text-sm">Tap to open camera</span>
        </div>
        <Teleport to="body">
          <ReceiptCameraCapture
            v-if="showCamera"
            @cancel="showCamera = false"
            @captured="handleCameraCapture"
          />
        </Teleport>
      </div>

      <!-- Upload tab -->
      <div v-else-if="activeTab === 'upload'" class="px-4">
        <ReceiptImageUpload @selected="handleFileSelected" />
      </div>

      <!-- Text tab -->
      <div v-else-if="activeTab === 'text'" class="px-4">
        <ReceiptTextInput @submit="handleTextSubmit" />
      </div>

      <!-- Submit button for camera/upload after selection -->
      <div
        v-if="(activeTab === 'camera' || activeTab === 'upload') && pendingFile"
        class="px-4 mt-4"
      >
        <UButton
          block
          size="xl"
          color="primary"
          :loading="uploading"
          @click="submitImage"
        >
          Process Receipt
        </UButton>
      </div>

      <!-- Processing state -->
      <div v-if="processing" class="px-4 mt-6 space-y-4">
        <div class="flex items-center gap-3 text-gray-500">
          <div class="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span class="text-sm">{{ processingMessage }}</span>
        </div>
        <div class="space-y-3">
          <USkeleton class="h-5 w-3/4 rounded-lg" />
          <USkeleton class="h-4 w-1/2 rounded-lg" />
          <USkeleton class="h-16 w-full rounded-xl" />
          <USkeleton class="h-16 w-full rounded-xl" />
          <USkeleton class="h-16 w-full rounded-xl" />
        </div>
      </div>

      <!-- Error state -->
      <div v-if="error" class="px-4 mt-4">
        <UAlert color="error" :description="error" />
      </div>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const tabs = [
  { id: 'camera', label: 'Camera', icon: 'i-heroicons-camera' },
  { id: 'upload', label: 'Upload', icon: 'i-heroicons-photo' },
  { id: 'text', label: 'Text', icon: 'i-heroicons-pencil-square' },
] as const

type TabId = typeof tabs[number]['id']

const activeTab = ref<TabId>('camera')
const showCamera = ref(false)
const pendingFile = ref<File | Blob | null>(null)
const uploading = ref(false)
const processing = ref(false)
const error = ref<string | null>(null)

const processingMessages = [
  'Reading receipt...',
  'Identifying items...',
  'Categorizing items...',
  'Comparing prices...',
  'Almost done...',
]
const processingMessage = ref(processingMessages[0])
let messageInterval: ReturnType<typeof setInterval> | null = null

function handleCameraCapture(blob: Blob) {
  showCamera.value = false
  pendingFile.value = blob
}

function handleFileSelected(file: File) {
  pendingFile.value = file
}

async function submitImage() {
  if (!pendingFile.value) return
  await processUpload(pendingFile.value)
}

async function handleTextSubmit(text: string) {
  uploading.value = true
  error.value = null
  try {
    const res = await $fetch('/api/receipts', {
      method: 'POST',
      body: { text },
    })
    await runProcessing((res as any).receiptId)
  } catch (e: any) {
    error.value = e.message || 'Failed to submit'
  } finally {
    uploading.value = false
  }
}

async function processUpload(file: File | Blob) {
  uploading.value = true
  error.value = null
  try {
    const formData = new FormData()
    formData.append('image', file, 'receipt.jpg')
    const res = await $fetch('/api/receipts', {
      method: 'POST',
      body: formData,
    })
    await runProcessing((res as any).receiptId)
  } catch (e: any) {
    error.value = e.message || 'Upload failed'
  } finally {
    uploading.value = false
  }
}

async function runProcessing(receiptId: string) {
  uploading.value = false
  processing.value = true

  // Cycle through processing messages
  let msgIndex = 0
  messageInterval = setInterval(() => {
    msgIndex = (msgIndex + 1) % processingMessages.length
    processingMessage.value = processingMessages[msgIndex]
  }, 2000)

  try {
    await $fetch(`/api/receipts/${receiptId}/process`, { method: 'POST' })
    await navigateTo(`/receipt/${receiptId}`)
  } catch (e: any) {
    error.value = e.message || 'Processing failed'
  } finally {
    processing.value = false
    if (messageInterval) clearInterval(messageInterval)
  }
}
</script>
