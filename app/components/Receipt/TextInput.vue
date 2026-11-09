<template>
  <div class="space-y-3">
    <p class="text-sm text-gray-500">Describe your receipt in natural language</p>
    <UTextarea
      v-model="text"
      placeholder="e.g. Bought 2 items at FamilyMart: green tea 150 yen, onigiri 120 yen. Total 270 yen."
      :rows="5"
      class="w-full"
      autoresize
    />
    <p class="text-xs text-gray-400">
      Include store name, items, prices, and date if you know them.
    </p>
    <UButton
      block
      color="primary"
      :disabled="!text.trim()"
      @click="$emit('submit', text)"
    >
      Process text
    </UButton>
  </div>
</template>

<script setup lang="ts">
defineEmits<{ submit: [text: string] }>()
const text = ref('')
</script>
