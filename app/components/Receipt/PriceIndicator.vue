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
}>()

const { formatCurrency } = useFormat()

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
  const pct = props.percentDiff == null ? 0 : Math.round(Math.abs(props.percentDiff))
  if (props.indicator === 'cheaper') return pct ? `-${pct}%` : 'Cheaper'
  if (props.indicator === 'expensive') return pct ? `+${pct}%` : 'Pricier'
  return 'Similar'
})

const tooltipText = computed(() => {
  if (!props.historicalAvg) return 'Compared to your purchase history'
  return `Historical avg: ${formatCurrency(props.historicalAvg)}`
})
</script>
