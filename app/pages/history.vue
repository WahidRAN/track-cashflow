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
            <div
              v-for="receipt in group.receipts"
              :key="receipt.id"
              class="relative overflow-hidden rounded-xl"
            >
              <!-- Delete action (revealed on swipe) -->
              <div class="absolute inset-y-0 right-0 flex items-center justify-end bg-red-500 rounded-xl px-5">
                <button class="text-white flex flex-col items-center gap-1 text-xs" @click="swipeDelete(receipt.id)">
                  <UIcon name="i-heroicons-trash" class="w-5 h-5" />
                  Delete
                </button>
              </div>
              <!-- Receipt row (slides left on swipe) -->
              <NuxtLink
                :to="`/receipt/${receipt.id}`"
                class="flex items-center gap-3 bg-white dark:bg-gray-800 p-4 shadow-sm active:opacity-70 relative z-10"
                :style="{
                  transform: swipedId === receipt.id ? `translateX(${swipeX}px)` : 'translateX(0)',
                  transition: swipedId === receipt.id ? 'none' : 'transform 0.2s ease',
                }"
                @touchstart="onSwipeStart"
                @touchmove="(e) => onSwipeMove(e, receipt.id)"
                @touchend="onSwipeEnd"
                @click.prevent="swipedId === receipt.id ? (swipedId = null) : navigateTo(`/receipt/${receipt.id}`)"
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

// Swipe-to-delete state
const swipedId = ref<string | null>(null)
const swipeX = ref(0)
let swipeStartX = 0
let swipeStartY = 0

function onSwipeStart(e: TouchEvent) {
  if (!e.touches[0]) return
  swipeStartX = e.touches[0].clientX
  swipeStartY = e.touches[0].clientY
}

function onSwipeMove(e: TouchEvent, id: string) {
  if (!e.touches[0]) return
  const dx = e.touches[0].clientX - swipeStartX
  const dy = Math.abs(e.touches[0].clientY - swipeStartY)
  if (dy > 20) return // scrolling vertically, not swiping
  if (dx < -10) {
    swipedId.value = id
    swipeX.value = Math.max(dx, -80)
  } else if (dx > 0 && swipedId.value === id) {
    swipedId.value = null
    swipeX.value = 0
  }
}

function onSwipeEnd() {
  if (swipeX.value < -60) {
    // Swiped far enough — keep revealed
  } else {
    swipedId.value = null
    swipeX.value = 0
  }
}

async function swipeDelete(id: string) {
  try {
    await $fetch(`/api/receipts/${id}`, { method: 'DELETE' })
    allReceipts.value = allReceipts.value.filter(r => r.id !== id)
    total.value--
    swipedId.value = null
  } catch {
    swipedId.value = null
  }
}

// Initial load
await fetchReceipts(true)
</script>
