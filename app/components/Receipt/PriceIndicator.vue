<template>
  <UTooltip
    v-if="indicator"
    :text="tooltipText"
  >
    <UBadge
      :color="color"
      variant="subtle"
      size="sm"
      class="gap-1 font-medium"
    >
      <UIcon :name="icon" class="w-3 h-3" />
      {{ label }}
    </UBadge>
  </UTooltip>
</template>

<script setup lang="ts">
const props = defineProps<{
  indicator: 'cheaper' | 'similar' | 'expensive' | null
  percentDiff: number | null
  historicalAvg: number | null
  currency?: string
}>()

const currency = props.currency || 'USD'

const color = computed(() => {
  if (props.indicator === 'cheaper') return 'success' as const
  if (props.indicator === 'expensive') return 'error' as const
  return 'neutral' as const
})

const icon = computed(() => {
  if (props.indicator === 'cheaper') return 'i-heroicons-arrow-trending-down'
  if (props.indicator === 'expensive') return 'i-heroicons-arrow-trending-up'
  return 'i-heroicons-minus'
})

const label = computed(() => {
  if (!props.percentDiff) return props.indicator || ''
  const abs = Math.abs(props.percentDiff)
  if (props.indicator === 'cheaper') return `-${abs}%`
  if (props.indicator === 'expensive') return `+${abs}%`
  return 'Similar'
})

const tooltipText = computed(() => {
  if (!props.historicalAvg) return 'Compared to your purchase history'
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(props.historicalAvg)
  return `Historical avg: ${formatted}`
})
</script>
