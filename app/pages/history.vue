<template>
  <NuxtLayout>
    <div class="max-w-lg mx-auto pb-20">
      <div class="px-4 pt-6 pb-4">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">History</h1>
      </div>

      <div v-if="pending" class="px-4 space-y-3">
        <USkeleton v-for="i in 6" :key="i" class="h-16 w-full rounded-xl" />
      </div>

      <div v-else-if="!data?.data?.length" class="text-center py-12 px-4">
        <div class="text-4xl mb-3">📋</div>
        <p class="text-gray-500 font-medium">No receipts found</p>
      </div>

      <div v-else class="px-4 space-y-2">
        <NuxtLink
          v-for="receipt in data.data"
          :key="receipt.id"
          :to="`/receipt/${receipt.id}`"
          class="block bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm active:scale-[0.98] transition-transform"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="flex-1 min-w-0">
              <p class="font-medium text-gray-900 dark:text-white text-sm truncate">{{ receipt.storeName }}</p>
              <p class="text-xs text-gray-400 mt-0.5">{{ formatDate(receipt.receiptDatetime) }}</p>
            </div>
            <p class="font-semibold text-gray-900 dark:text-white flex-shrink-0">
              {{ formatCurrency(receipt.total) }}
            </p>
          </div>
        </NuxtLink>

        <div v-if="data.total > (data.pageSize || 20)" class="text-center pt-4 pb-2">
          <p class="text-sm text-gray-400">Showing {{ data.data.length }} of {{ data.total }}</p>
        </div>
      </div>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { ReceiptListResponse } from '~/types/api'

definePageMeta({ middleware: 'auth' })

const { data, pending } = await useFetch<ReceiptListResponse>('/api/receipts', { query: { pageSize: 50 } })

function formatCurrency(amount: number | null): string {
  if (amount === null) return '-'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))
}
</script>
