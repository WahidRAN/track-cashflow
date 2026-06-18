<template>
  <NuxtLayout>
    <div class="max-w-lg mx-auto pb-20">
      <!-- Header with back button -->
      <div class="flex items-center gap-3 px-4 pt-6 pb-4">
        <NuxtLink to="/" class="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <UIcon name="i-heroicons-arrow-left" class="w-5 h-5" />
        </NuxtLink>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white flex-1 truncate">
          {{ receipt?.storeName || 'Receipt' }}
        </h1>
      </div>

      <!-- Loading state -->
      <div v-if="pending" class="px-4 space-y-4">
        <USkeleton class="h-24 w-full rounded-2xl" />
        <USkeleton class="h-16 w-full rounded-xl" />
        <USkeleton class="h-16 w-full rounded-xl" />
        <USkeleton class="h-16 w-full rounded-xl" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="px-4">
        <UAlert color="error" :description="error.message" />
      </div>

      <!-- Content -->
      <template v-else-if="receipt">
        <!-- Receipt meta card -->
        <div class="mx-4 mb-4 bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
          <!-- Store name and date -->
          <div class="flex items-start justify-between mb-3">
            <div>
              <p class="font-semibold text-gray-900 dark:text-white text-lg">{{ receipt.storeName }}</p>
              <p class="text-sm text-gray-400">{{ formatDate(receipt.receiptDatetime) }}</p>
            </div>
            <div class="text-right">
              <p class="text-xs text-gray-400 uppercase tracking-wide">Total</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ formatCurrency(receipt.total) }}
              </p>
            </div>
          </div>

          <!-- Status badge -->
          <UBadge
            :color="statusColor"
            variant="subtle"
            size="sm"
          >
            {{ receipt.processingStatus }}
          </UBadge>
        </div>

        <!-- Receipt image (if exists) -->
        <div v-if="receipt.imageUrl" class="mx-4 mb-4">
          <img
            :src="receipt.imageUrl"
            class="w-full rounded-2xl object-contain max-h-48 bg-gray-100"
            loading="lazy"
          />
        </div>

        <!-- Items section -->
        <div class="px-4">
          <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Items ({{ receipt.items?.length || 0 }})
          </h2>

          <div class="space-y-2">
            <div
              v-for="item in receipt.items"
              :key="item.id"
              class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-gray-900 dark:text-white text-sm leading-tight">
                    {{ item.generalizedName }}
                  </p>
                  <p v-if="item.brandName" class="text-xs text-gray-400 mt-0.5">{{ item.brandName }}</p>
                  <div class="flex items-center gap-2 mt-1.5">
                    <span v-if="item.categoryName" class="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                      {{ item.categoryName }}
                    </span>
                    <span v-if="item.quantity && item.quantity !== 1" class="text-xs text-gray-400">
                      x {{ item.quantity }}
                    </span>
                  </div>
                </div>
                <div class="text-right flex-shrink-0">
                  <p class="font-semibold text-gray-900 dark:text-white text-sm">
                    {{ formatCurrency(item.lineTotal) }}
                  </p>
                  <p v-if="item.unitPrice !== item.lineTotal" class="text-xs text-gray-400">
                    {{ formatCurrency(item.unitPrice) }} each
                  </p>
                  <div class="mt-1 flex justify-end">
                    <ReceiptPriceIndicator
                      :indicator="item.priceIndicator"
                      :percent-diff="item.pricePercentDiff"
                      :historical-avg="item.historicalAvgPrice"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Totals breakdown -->
          <div class="mt-4 bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm space-y-2">
            <div v-if="receipt.subtotal" class="flex justify-between text-sm">
              <span class="text-gray-500">Subtotal</span>
              <span class="text-gray-700 dark:text-gray-300">{{ formatCurrency(receipt.subtotal) }}</span>
            </div>
            <div v-if="receipt.taxTotal" class="flex justify-between text-sm">
              <span class="text-gray-500">Tax</span>
              <span class="text-gray-700 dark:text-gray-300">{{ formatCurrency(receipt.taxTotal) }}</span>
            </div>
            <div class="flex justify-between font-semibold border-t border-gray-100 dark:border-gray-700 pt-2">
              <span class="text-gray-900 dark:text-white">Total</span>
              <span class="text-gray-900 dark:text-white">{{ formatCurrency(receipt.total) }}</span>
            </div>
          </div>

          <!-- Delete button -->
          <div class="mt-6">
            <UButton
              block
              color="error"
              variant="ghost"
              size="sm"
              :loading="deleting"
              @click="deleteReceipt"
            >
              Delete receipt
            </UButton>
          </div>
        </div>
      </template>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { Receipt } from '~/types/api'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const id = route.params.id as string

const { data, pending, error } = await useFetch<Receipt & { items: any[] }>(`/api/receipts/${id}`)
const receipt = computed(() => data.value)

const statusColor = computed(() => {
  const s = receipt.value?.processingStatus
  if (s === 'done') return 'success' as const
  if (s === 'error') return 'error' as const
  if (s === 'processing') return 'warning' as const
  return 'neutral' as const
})

function formatCurrency(amount: number | null): string {
  if (amount === null) return '-'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso))
}

const deleting = ref(false)

async function deleteReceipt() {
  if (!confirm('Delete this receipt?')) return
  deleting.value = true
  try {
    await $fetch(`/api/receipts/${id}`, { method: 'DELETE' })
    await navigateTo('/')
  } catch {
    deleting.value = false
  }
}
</script>
