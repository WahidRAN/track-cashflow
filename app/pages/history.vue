<template>
  <div class="max-w-lg mx-auto pb-6">
    <!-- Header -->
    <div class="px-4 pt-6 pb-3">
      <h1 class="text-xl font-bold text-gray-900 dark:text-white mb-4">History</h1>
      <DashboardSearchFilter @change="onFilterChange" />
    </div>

    <!-- Loading -->
    <div v-if="loading" class="px-4 space-y-3 mt-2">
      <USkeleton v-for="i in 5" :key="i" class="h-16 w-full rounded-xl" />
    </div>

    <!-- Error -->
    <div v-else-if="listError && !allReceipts.length" class="px-4 mt-2 space-y-3">
      <UAlert color="error" variant="subtle" :description="getErrorMessage(listError, 'Could not load receipts')" />
      <UButton block variant="soft" color="neutral" @click="() => refresh()">
        Try again
      </UButton>
    </div>

    <!-- Empty -->
    <div v-else-if="!groupedReceipts.length" class="text-center py-16 px-4">
      <div class="text-4xl mb-3">🔍</div>
      <p class="text-gray-500 font-medium">No receipts found</p>
      <p class="text-gray-400 text-sm mt-1">Try adjusting your filters</p>
    </div>

    <!-- Grouped list -->
    <div v-else class="px-4 mt-2 space-y-6">
      <div v-for="group in groupedReceipts" :key="group.key">
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
                <p class="font-medium text-gray-900 dark:text-white text-sm truncate">{{ receipt.storeName || 'Untitled receipt' }}</p>
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
</template>

<script setup lang="ts">
import type { Receipt, ReceiptListResponse } from '~/types/api'
import type { FilterValues } from '~/components/Dashboard/SearchFilter.vue'

definePageMeta({ middleware: 'auth' })

const PAGE_SIZE = 30

const { formatCurrency, formatTime, formatDayLabel, dayKey, dateParts } = useFormat()
const toast = useToast()

// Current filter state
const filters = ref<FilterValues>({ search: '', category: null, from: null, to: null })

const listQuery = computed(() => {
  const q: Record<string, string> = { pageSize: String(PAGE_SIZE) }
  const f = filters.value
  if (f.search) q.search = f.search
  if (f.category) q.category = f.category
  if (f.from) q.from = f.from
  if (f.to) q.to = f.to
  return q
})

// First page via useFetch: during SSR it forwards the auth cookie (plain $fetch does not, which
// would 401) and the client hydrates from the payload instead of fetching twice. It refetches
// automatically whenever the filters change.
const { data: firstPage, status, error: listError, refresh } = await useFetch<ReceiptListResponse>('/api/receipts', {
  query: computed(() => ({ ...listQuery.value, page: '1' })),
})

// Accumulated list: first page + any "Load more" pages (client-side only)
const page = ref(1)
const allReceipts = ref<Receipt[]>([])
const total = ref(0)
const loadingMore = ref(false)

watch(firstPage, (res) => {
  page.value = 1
  allReceipts.value = res?.data ? [...res.data] : []
  total.value = res?.total ?? 0
}, { immediate: true })

const loading = computed(() => status.value === 'pending')
const hasMore = computed(() => allReceipts.value.length < total.value)

async function loadMore() {
  if (loadingMore.value) return
  loadingMore.value = true
  try {
    const next = page.value + 1
    const res = await $fetch<ReceiptListResponse>('/api/receipts', {
      query: { ...listQuery.value, page: String(next) },
    })
    // Deletes shift offsets, so guard against showing a row twice
    const seen = new Set(allReceipts.value.map(r => r.id))
    allReceipts.value.push(...res.data.filter(r => !seen.has(r.id)))
    total.value = res.total
    page.value = next
  } catch (e) {
    toast.add({ title: 'Could not load more receipts', description: getErrorMessage(e), color: 'error' })
  } finally {
    loadingMore.value = false
  }
}

function onFilterChange(newFilters: FilterValues) {
  filters.value = newFilters
}

// Group receipts by calendar day (in the configured time zone, so SSR and client agree)
const groupedReceipts = computed(() => {
  const groups: Array<{ label: string, key: string, receipts: Receipt[], total: number }> = []
  const byKey = new Map<string, (typeof groups)[number]>()
  const now = new Date()
  const todayKey = dayKey(now)
  const yesterdayKey = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  const thisYear = dateParts(now)?.year

  for (const receipt of allReceipts.value) {
    const key = dayKey(receipt.receiptDatetime) || 'undated'
    let group = byKey.get(key)
    if (!group) {
      let label: string
      if (key === todayKey) label = 'Today'
      else if (key === yesterdayKey) label = 'Yesterday'
      else if (key === 'undated') label = 'No date'
      // "June 15", or "June 15, 2024" for other years
      else label = formatDayLabel(receipt.receiptDatetime, dateParts(receipt.receiptDatetime)?.year !== thisYear)
      group = { label, key, receipts: [], total: 0 }
      byKey.set(key, group)
      groups.push(group)
    }
    group.receipts.push(receipt)
    group.total += receipt.total || 0
  }

  return groups
})

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
    total.value = Math.max(0, total.value - 1)
  } catch (e) {
    toast.add({ title: 'Could not delete receipt', description: getErrorMessage(e), color: 'error' })
  } finally {
    swipedId.value = null
    swipeX.value = 0
  }
}
</script>
