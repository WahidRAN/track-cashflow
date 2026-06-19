<template>
  <div class="space-y-3">
    <!-- Search input -->
    <UInput
      v-model="search"
      icon="i-heroicons-magnifying-glass"
      placeholder="Search store name..."
      class="w-full"
      @input="emitDebounced"
    />

    <!-- Filter chips row -->
    <div class="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      <!-- Date range quick picks -->
      <button
        v-for="preset in datePresets"
        :key="preset.id"
        class="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors"
        :class="[
          activeDatePreset === preset.id
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800'
        ]"
        @click="selectDatePreset(preset)"
      >
        {{ preset.label }}
      </button>
    </div>

    <!-- Category pills -->
    <div class="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      <button
        class="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors"
        :class="[
          !activeCategory
            ? 'bg-gray-900 dark:bg-white border-gray-900 text-white dark:text-gray-900'
            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800'
        ]"
        @click="selectCategory(null)"
      >
        All
      </button>
      <button
        v-for="cat in categories"
        :key="cat"
        class="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors"
        :class="[
          activeCategory === cat
            ? 'bg-gray-900 dark:bg-white border-gray-900 text-white dark:text-gray-900'
            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800'
        ]"
        @click="selectCategory(cat)"
      >
        {{ cat }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface FilterValues {
  search: string
  category: string | null
  from: string | null
  to: string | null
}

const emit = defineEmits<{ change: [filters: FilterValues] }>()

const search = ref('')
const activeCategory = ref<string | null>(null)
const activeDatePreset = ref<string>('all')

const categories = [
  'Groceries', 'Personal Care', 'Household', 'Pharmacy',
  'Restaurant', 'Coffee', 'Clothing', 'Electronics',
  'Transportation', 'Entertainment', 'Other',
]

interface DatePreset {
  id: string
  label: string
  from: string | null
  to: string | null
}

function isoNow() { return new Date().toISOString() }
function isoStartOf(unit: 'week' | 'month' | 'year') {
  const d = new Date()
  if (unit === 'week') d.setDate(d.getDate() - d.getDay())
  if (unit === 'month') d.setDate(1)
  if (unit === 'year') { d.setMonth(0); d.setDate(1) }
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

const datePresets: DatePreset[] = [
  { id: 'all', label: 'All time', from: null, to: null },
  { id: 'week', label: 'This week', from: isoStartOf('week'), to: isoNow() },
  { id: 'month', label: 'This month', from: isoStartOf('month'), to: isoNow() },
  { id: 'year', label: 'This year', from: isoStartOf('year'), to: isoNow() },
]

let activePreset: DatePreset = datePresets[0]!

function selectDatePreset(preset: DatePreset) {
  activeDatePreset.value = preset.id
  activePreset = preset
  emitFilters()
}

function selectCategory(cat: string | null) {
  activeCategory.value = cat
  emitFilters()
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
function emitDebounced() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(emitFilters, 300)
}

function emitFilters() {
  emit('change', {
    search: search.value,
    category: activeCategory.value,
    from: activePreset.from,
    to: activePreset.to,
  })
}
</script>
