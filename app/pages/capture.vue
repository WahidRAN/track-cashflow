<template>
  <div class="max-w-lg mx-auto pb-6">
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
          :disabled="busy"
          @click="selectTab(tab.id)"
        >
          <UIcon :name="tab.icon" class="w-4 h-4" />
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Camera tab -->
    <div v-if="activeTab === 'camera'" class="px-4">
      <!-- Captured photo preview -->
      <div v-if="cameraPreviewUrl" class="relative">
        <img :src="cameraPreviewUrl" alt="Captured receipt" class="w-full max-h-80 object-contain rounded-2xl bg-gray-900">
        <button
          v-if="!busy"
          class="absolute top-2 right-2 bg-black/60 text-white text-xs font-medium rounded-full px-3 py-1.5 flex items-center gap-1"
          @click="openCamera"
        >
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4" />
          Retake
        </button>
      </div>
      <button
        v-else
        type="button"
        class="w-full aspect-[4/3] rounded-2xl bg-gray-900 flex flex-col items-center justify-center gap-4"
        @click="openCamera"
      >
        <div class="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
          <UIcon name="i-heroicons-camera" class="w-8 h-8 text-white" />
        </div>
        <span class="text-white/70 text-sm">Tap to open camera</span>
      </button>
      <UAlert
        v-if="cameraUnavailable"
        color="warning"
        variant="subtle"
        icon="i-heroicons-exclamation-triangle"
        class="mt-3"
        :description="cameraUnavailable"
      />
      <!-- v-if on the Teleport itself: it is only ever opened client-side, and Nuxt can't SSR teleports to body -->
      <Teleport v-if="showCamera" to="body">
        <ReceiptCameraCapture
          @cancel="showCamera = false"
          @captured="handleCameraCapture"
          @unavailable="handleCameraUnavailable"
        />
      </Teleport>
    </div>

    <!-- Upload tab -->
    <div v-else-if="activeTab === 'upload'" class="px-4">
      <ReceiptImageUpload @selected="handleFileSelected" @cleared="pendingFile = null" />
    </div>

    <!-- Text tab -->
    <div v-else-if="activeTab === 'text'" class="px-4">
      <ReceiptTextInput :disabled="busy" @submit="handleTextSubmit" />
    </div>

    <!-- Submit button for camera/upload after selection -->
    <div
      v-if="(activeTab === 'camera' || activeTab === 'upload') && pendingFile && !processing"
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
      <div>
        <div class="flex items-center gap-3 text-gray-500">
          <div class="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span class="text-sm">{{ processingMessage }}</span>
        </div>
        <p class="mt-1 pl-8 text-xs text-gray-400 dark:text-gray-500">
          This can take up to a minute
        </p>
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
      <UAlert color="error" variant="subtle" :description="error" />
    </div>
  </div>
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
const cameraUnavailable = ref<string | null>(null)
const pendingFile = ref<File | Blob | null>(null)
const cameraPreviewUrl = ref<string | null>(null)
const uploading = ref(false)
const processing = ref(false)
const busy = computed(() => uploading.value || processing.value)
const error = ref<string | null>(null)
const toast = useToast()

const processingMessages = [
  'Reading receipt...',
  'Identifying items...',
  'Categorizing items...',
  'Comparing prices...',
  'Almost done...',
]
const processingMessage = ref(processingMessages[0])
let messageInterval: ReturnType<typeof setInterval> | null = null

function setCameraPreview(blob: Blob | null) {
  if (cameraPreviewUrl.value) URL.revokeObjectURL(cameraPreviewUrl.value)
  cameraPreviewUrl.value = blob ? URL.createObjectURL(blob) : null
}

function selectTab(id: TabId) {
  if (id === activeTab.value) return
  activeTab.value = id
  // A selection belongs to the tab it was made in (the upload preview unmounts with its tab)
  pendingFile.value = null
  setCameraPreview(null)
  error.value = null
}

function openCamera() {
  cameraUnavailable.value = null
  showCamera.value = true
}

function handleCameraCapture(blob: Blob) {
  showCamera.value = false
  pendingFile.value = blob
  setCameraPreview(blob)
}

function handleCameraUnavailable(reason: string) {
  showCamera.value = false
  cameraUnavailable.value = reason
}

function handleFileSelected(file: File) {
  pendingFile.value = file
}

async function submitImage() {
  if (!pendingFile.value) return
  // pendingFile is cleared on tab switch, so the active tab is where this image came from
  await processUpload(pendingFile.value, activeTab.value === 'camera' ? 'camera' : 'upload')
}

async function handleTextSubmit(text: string) {
  uploading.value = true
  error.value = null
  try {
    const receiptId = await createReceipt(text)
    await runProcessing(receiptId)
  } catch (e) {
    error.value = getErrorMessage(e, 'Failed to submit')
  } finally {
    uploading.value = false
  }
}

async function processUpload(file: File | Blob, inputMethod: ImageInputMethod) {
  uploading.value = true
  error.value = null
  try {
    const receiptId = await createReceipt({ image: file, inputMethod })
    await runProcessing(receiptId)
  } catch (e) {
    error.value = getErrorMessage(e, 'Upload failed')
  } finally {
    uploading.value = false
  }
}

async function runProcessing(receiptId: string) {
  uploading.value = false
  processing.value = true

  // Step through processing messages, then hold on the last one
  // (local inference can take 30–90s, so don't loop back to the start)
  let msgIndex = 0
  processingMessage.value = processingMessages[0]
  if (messageInterval) clearInterval(messageInterval)
  messageInterval = setInterval(() => {
    msgIndex = Math.min(msgIndex + 1, processingMessages.length - 1)
    processingMessage.value = processingMessages[msgIndex]
    if (msgIndex === processingMessages.length - 1 && messageInterval) {
      clearInterval(messageInterval)
      messageInterval = null
    }
  }, 2000)

  try {
    const outcome = await processReceipt(receiptId)
    if (outcome === 'already-processing') {
      toast.add({
        title: 'Already processing',
        description: 'This receipt is still being read. It will update on its page when done.',
        color: 'info',
      })
    }
    await navigateTo(`/receipt/${receiptId}`)
  } catch (e) {
    error.value = getErrorMessage(e, 'Processing failed')
  } finally {
    processing.value = false
    if (messageInterval) clearInterval(messageInterval)
    messageInterval = null
  }
}

onBeforeUnmount(() => {
  if (messageInterval) clearInterval(messageInterval)
  setCameraPreview(null)
})
</script>
