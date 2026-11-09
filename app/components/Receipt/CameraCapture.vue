<template>
  <div class="fixed inset-0 bg-black z-50 flex flex-col">
    <!-- Camera viewport -->
    <div class="relative flex-1 overflow-hidden">
      <video
        ref="videoEl"
        class="w-full h-full object-cover"
        autoplay
        playsinline
        muted
      />
      <!-- Corner guides -->
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute top-12 left-8 w-12 h-12 border-l-2 border-t-2 border-white/70 rounded-tl-lg" />
        <div class="absolute top-12 right-8 w-12 h-12 border-r-2 border-t-2 border-white/70 rounded-tr-lg" />
        <div class="absolute bottom-28 left-8 w-12 h-12 border-l-2 border-b-2 border-white/70 rounded-bl-lg" />
        <div class="absolute bottom-28 right-8 w-12 h-12 border-r-2 border-b-2 border-white/70 rounded-br-lg" />
      </div>
      <!-- Hint text -->
      <div class="absolute top-6 inset-x-0 text-center">
        <span class="text-white/80 text-sm bg-black/30 px-3 py-1 rounded-full">
          Point at receipt
        </span>
      </div>
    </div>

    <!-- Controls bar -->
    <div class="bg-black/90 safe-bottom px-6 py-6 flex items-center justify-between gap-4">
      <!-- Cancel -->
      <button
        class="w-12 h-12 flex items-center justify-center text-white/70"
        @click="$emit('cancel')"
      >
        <UIcon name="i-heroicons-x-mark" class="w-6 h-6" />
      </button>

      <!-- Capture -->
      <button
        class="w-20 h-20 rounded-full bg-white border-4 border-white/30 flex items-center justify-center shadow-xl active:scale-95 transition-transform"
        :disabled="!ready"
        @click="capture"
      >
        <div class="w-16 h-16 rounded-full bg-white" />
      </button>

      <!-- Flash toggle placeholder -->
      <div class="w-12 h-12" />
    </div>

    <!-- Canvas (hidden, used for capture) -->
    <canvas ref="canvasEl" class="hidden" />

    <!-- Preview overlay after capture -->
    <div
      v-if="previewUrl"
      class="fixed inset-0 bg-black z-10 flex flex-col"
    >
      <img :src="previewUrl" class="flex-1 object-contain w-full" />
      <div class="bg-black/90 safe-bottom px-6 py-6 flex items-center justify-between gap-4">
        <UButton
          variant="ghost"
          color="neutral"
          class="text-white"
          @click="retake"
        >
          Retake
        </UButton>
        <UButton
          color="primary"
          size="xl"
          class="flex-1"
          :loading="uploading"
          @click="usePhoto"
        >
          Use Photo
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  cancel: []
  captured: [blob: Blob]
}>()

const videoEl = ref<HTMLVideoElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const ready = ref(false)
const previewUrl = ref<string | null>(null)
const capturedBlob = ref<Blob | null>(null)
const uploading = ref(false)
let stream: MediaStream | null = null

onMounted(async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    })
    if (videoEl.value) {
      videoEl.value.srcObject = stream
      await videoEl.value.play()
      ready.value = true
    }
  } catch {
    // Fallback: emit cancel so parent can switch to upload
    emit('cancel')
  }
})

onUnmounted(() => {
  stream?.getTracks().forEach(t => t.stop())
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

function capture() {
  if (!videoEl.value || !canvasEl.value || !ready.value) return
  const video = videoEl.value
  const canvas = canvasEl.value
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')!.drawImage(video, 0, 0)
  canvas.toBlob(
    (blob) => {
      if (!blob) return
      capturedBlob.value = blob
      previewUrl.value = URL.createObjectURL(blob)
      stream?.getTracks().forEach(t => t.stop())
    },
    'image/jpeg',
    0.92,
  )
}

function retake() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
  capturedBlob.value = null
  // Restart stream
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
    audio: false,
  }).then(s => {
    stream = s
    if (videoEl.value) {
      videoEl.value.srcObject = s
      videoEl.value.play()
    }
  })
}

function usePhoto() {
  if (capturedBlob.value) emit('captured', capturedBlob.value)
}
</script>
