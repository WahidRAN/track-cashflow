<template>
  <NuxtLayout>
    <div class="max-w-lg mx-auto pb-20">
      <!-- Header -->
      <div class="px-4 pt-6 pb-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white mb-4">History</h1>
        <DashboardSearchFilter @change="onFilterChange" />
      </div>

      <!-- Loading -->
      <div v-if="loading" class="px-4 space-y-3 mt-2">
        <USkeleton v-for="i in 5" :key="i" class="h-16 w-full rounded-xl" />
      </div>

      <!-- Empty -->
      <div v-else-if="!groupedReceipts.length" class="text-center py-16 px-4">
        <div class="text-4xl mb-3">🔍</div>
        <p class="text-gray-500 font-medium">No receipts found</p>
        <p class="text-gray-400 text-sm mt-1">Try adjusting your filters</p>
      </div>

      <!-- Grouped list -->
      <div v-else class="px-4 mt-2 space-y-6">
        <div v-for="group in groupedReceipts" :key="group.label">
          <!-- Date group header -->
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {{ group.label }}
            </h3>
            <span class="text-xs text-gray-400">{{ formatCurrency(group.total) }}</span>
          </div>

          <!-- Receipts in group -->
          <div class="space-y-2">
            <NuxtLink
              v-for="receipt in group.receipts"
              :key="receipt.id"
              :to="`/receipt/${receipt.id}`"
              class="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm active:scale-[0.98] transition-transform"
            >
              <!-- Store icon placeholder -->
              <div class="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-heroicons-receipt-percent" class="w-5 h-5 text-gray-400" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-medium text-gray-900 dark:text-white text-sm truncate">{{ receipt.storeName }}</p>
                <p class="text-xs text-gray-400 mt-0.5">{{ formatTime(receipt.receiptDatetime) }}</p>
              </div>
              <div class="text-right flex-shrink-0">
                <p class="font-semibold text-gray-900 dark:text-white text-sm">
                  {{ formatCurrency(receipt.total) }}
                </p>
                <UBadge
                  v-if="receipt.processingStatus !== 'done'"
                  :color="receipt.processingStatus === 'error' ? 'error' : 'warning'"
                  variant="subtle"
                  size="xs"
                  class="mt-1"
                >
                  {{ receipt.processingStatus }}
                </UBadge>
              </div>
            </NuxtLink>
          </div>
        </div>

        <!-- Load more -->
        <div v-if="hasMore" class="text-center pb-4">
          <UButton variant="ghost" color="neutral" :loading="loadingMore" @click="loadMore">
            Load more
          </UButton>
        </div>
      </div>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { Receipt } from '~/types/api'
import type { FilterValues } from '~/components/Dashboard/SearchFilter.vue'

definePageMeta({ middleware: 'auth' })

const PAGE_SIZE = 30

// Current filter state
const filters = ref<FilterValues>({ search: '', category: null, from: null, to: null })

// Pagination
const page = ref(1)
const allReceipts = ref<Receipt[]>([])
const total = ref(0)
const loading = ref(true)
const loadingMore = ref(false)

const hasMore = computed(() => allReceipts.value.length < total.value)

async function fetchReceipts(reset = false) {
  if (reset) {
    loading.value = true
    page.value = 1
    allReceipts.value = []
  } else {
    loadingMore.value = true
  }

  try {
    const params: Record<string, string> = {
      page: String(page.value),
      pageSize: String(PAGE_SIZE),
    }
    if (filters.value.search) params.search = filters.value.search
    if (filters.value.category) params.category = filters.value.category
    if (filters.value.from) params.from = filters.value.from
    if (filters.value.to) params.to = filters.value.to

    const result = await $fetch<{ data: Receipt[]; total: number }>('/api/receipts', { query: params })

    if (reset) {
      allReceipts.value = result.data
    } else {
      allReceipts.value.push(...result.data)
    }
    total.value = result.total
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

async function loadMore() {
  page.value++
  await fetchReceipts(false)
}

function onFilterChange(newFilters: FilterValues) {
  filters.value = newFilters
  fetchReceipts(true)
}

// Group receipts by date
const groupedReceipts = computed(() => {
  const groups: Array<{ label: string; key: string; receipts: Receipt[]; total: number }> = []
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  for (const receipt of allReceipts.value) {
    const d = new Date(receipt.receiptDatetime)
    const isToday = d.toDateString() === today.toDateString()
    const isYesterday = d.toDateString() === yesterday.toDateString()

    let label: string
    let key: string

    if (isToday) {
      label = 'Today'
      key = 'today'
    } else if (isYesterday) {
      label = 'Yesterday'
      key = 'yesterday'
    } else {
      // "June 15" or "June 15, 2024" if different year
      const sameYear = d.getFullYear() === today.getFullYear()
      label = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', ...(!sameYear && { year: 'numeric' }) })
      key = d.toDateString()
    }

    const existing = groups.find(g => g.key === key)
    if (existing) {
      existing.receipts.push(receipt)
      existing.total += receipt.total
    } else {
      groups.push({ label, key, receipts: [receipt], total: receipt.total })
    }
  }

  return groups
})

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

// Initial load
await fetchReceipts(true)
</script>
