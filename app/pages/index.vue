<template>
  <NuxtLayout>
    <div class="max-w-lg mx-auto pb-20">
      <!-- Pull to refresh indicator -->
      <div
        class="flex justify-center transition-all duration-200 overflow-hidden"
        :style="{ height: pulling ? `${Math.min(pullDistance, 60)}px` : '0px' }"
      >
        <div class="flex items-center gap-2 text-emerald-500 text-sm">
          <div
            class="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full"
            :class="{ 'animate-spin': refreshing }"
          />
          <span v-if="refreshing">Refreshing...</span>
          <span v-else-if="pullDistance >= 60">Release to refresh</span>
          <span v-else>Pull to refresh</span>
        </div>
      </div>

      <!-- PWA Install Banner -->
      <div
        v-if="canInstall && !installed"
        class="mx-4 mb-3 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 flex items-center gap-3"
      >
        <div class="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <span class="text-white text-lg">💰</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-medium text-emerald-900 dark:text-emerald-100 text-sm">Add to Home Screen</p>
          <p class="text-xs text-emerald-600 dark:text-emerald-400">Access Track Cashflow from your phone</p>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <button class="text-xs text-emerald-500 px-2 py-1" @click="dismiss">Later</button>
          <UButton size="xs" color="primary" @click="install">Install</UButton>
        </div>
      </div>

      <!-- Header -->
      <div class="px-4 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Cashflow</h1>
          <p class="text-sm text-gray-400">{{ currentMonthLabel }}</p>
        </div>
        <div class="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
          <span class="text-lg">💰</span>
        </div>
      </div>

      <!-- Month summary card -->
      <div class="mx-4 mb-4 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg">
        <p class="text-emerald-100 text-sm mb-1">This month</p>
        <p class="text-4xl font-bold tracking-tight">
          <span v-if="cashflowPending">...</span>
          <span v-else>{{ formatCurrency(currentMonthTotal) }}</span>
        </p>
        <p v-if="monthDelta !== null" class="text-emerald-100 text-sm mt-2 flex items-center gap-1">
          <UIcon :name="monthDelta >= 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'" class="w-4 h-4" />
          {{ Math.abs(monthDelta).toFixed(0) }}% vs last month
        </p>
      </div>

      <!-- Category breakdown -->
      <div v-if="categories?.length" class="mx-4 mb-4">
        <DashboardCategoryBreakdown
          :categories="categories"
          :total="categoryData?.total || 0"
        />
      </div>

      <!-- Recent receipts -->
      <div class="px-4">
        <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Recent</h2>

        <div v-if="receiptsPending" class="space-y-3">
          <USkeleton v-for="i in 4" :key="i" class="h-16 w-full rounded-xl" />
        </div>

        <div v-else-if="!receipts?.data?.length" class="text-center py-12">
          <div class="text-4xl mb-3">🧾</div>
          <p class="text-gray-500 font-medium">No receipts yet</p>
          <p class="text-gray-400 text-sm mt-1">Tap the camera button to add your first receipt</p>
        </div>

        <div v-else class="space-y-2">
          <NuxtLink
            v-for="receipt in receipts.data"
            :key="receipt.id"
            :to="`/receipt/${receipt.id}`"
            class="block bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm active:scale-[0.98] transition-transform"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="flex-1 min-w-0">
                <p class="font-medium text-gray-900 dark:text-white text-sm truncate">
                  {{ receipt.storeName }}
                </p>
                <p class="text-xs text-gray-400 mt-0.5">{{ formatDate(receipt.receiptDatetime) }}</p>
              </div>
              <div class="text-right flex-shrink-0">
                <p class="font-semibold text-gray-900 dark:text-white">
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
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { ReceiptListResponse, CashflowResponse, CategoryBreakdownResponse } from '~/types/api'

definePageMeta({ middleware: 'auth' })

const { data: receipts, pending: receiptsPending, refresh: refreshReceipts } = await useFetch<ReceiptListResponse>('/api/receipts', {
  query: { pageSize: 10 },
})

const { data: cashflowData, pending: cashflowPending, refresh: refreshCashflow } = await useFetch<CashflowResponse>('/api/analytics/cashflow')
const { data: categoryData, refresh: refreshCategories } = await useFetch<CategoryBreakdownResponse>('/api/analytics/categories')

const now = new Date()
const currentMonthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

const currentMonthTotal = computed(() => {
  const months = cashflowData.value?.months || []
  const current = months.find(m => m.year === now.getFullYear() && m.month === now.getMonth() + 1)
  return current?.total || 0
})

const monthDelta = computed(() => {
  const months = cashflowData.value?.months || []
  const curr = months.find(m => m.year === now.getFullYear() && m.month === now.getMonth() + 1)
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth()
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const prev = months.find(m => m.year === prevYear && m.month === prevMonth)
  if (!curr || !prev || prev.total === 0) return null
  return ((curr.total - prev.total) / prev.total) * 100
})

const categories = computed(() => categoryData.value?.categories || [])

function formatCurrency(amount: number | null): string {
  if (amount === null) return '-'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

// Pull to refresh
const { refreshing, pulling, pullDistance } = usePullToRefresh(async () => {
  await Promise.all([
    refreshReceipts(),
    refreshCashflow(),
    refreshCategories(),
  ])
})

// PWA install banner
const { canInstall, installed, install, dismiss } = usePwaInstall()
</script>
