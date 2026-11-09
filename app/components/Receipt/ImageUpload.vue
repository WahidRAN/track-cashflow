<template>
  <div
    class="border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer"
    :class="[
      dragging ? 'border-primary-400 bg-primary-50 dark:bg-primary-950' : 'border-gray-200 dark:border-gray-700',
    ]"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="handleDrop"
    @click="fileInput?.click()"
  >
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      capture="environment"
      class="hidden"
      @change="handleFile"
    />

    <div v-if="!preview" class="flex flex-col items-center gap-3">
      <div class="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <UIcon name="i-heroicons-photo" class="w-8 h-8 text-gray-400" />
      </div>
      <div>
        <p class="font-medium text-gray-700 dark:text-gray-300">Upload receipt photo</p>
        <p class="text-sm text-gray-400 mt-1">Tap to browse or drag &amp; drop</p>
      </div>
    </div>

    <div v-else class="relative">
      <img :src="preview" class="max-h-64 mx-auto rounded-xl object-contain" />
      <button
        class="absolute top-2 right-2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center"
        @click.stop="clear"
      >
        <UIcon name="i-heroicons-x-mark" class="w-4 h-4 text-white" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  selected: [file: File]
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const preview = ref<string | null>(null)

function handleFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) setFile(file)
}

function handleDrop(e: DragEvent) {
  dragging.value = false
  const file = e.dataTransfer?.files[0]
  if (file?.type.startsWith('image/')) setFile(file)
}

function setFile(file: File) {
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = URL.createObjectURL(file)
  emit('selected', file)
}

function clear() {
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = null
  if (fileInput.value) fileInput.value.value = ''
}

onUnmounted(() => {
  if (preview.value) URL.revokeObjectURL(preview.value)
})
</script>
