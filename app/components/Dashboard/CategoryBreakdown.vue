<template>
  <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
    <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Spending by Category</h2>

    <div v-if="!categories.length" class="text-center py-8 text-gray-400 text-sm">
      No data yet
    </div>

    <template v-else>
      <!-- Donut chart -->
      <div class="relative w-48 h-48 mx-auto mb-4">
        <Doughnut :data="chartData" :options="chartOptions" />
        <!-- Center label -->
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ formatCurrency(total) }}</p>
          <p class="text-xs text-gray-400">total</p>
        </div>
      </div>

      <!-- Legend list -->
      <div class="space-y-2 mt-4">
        <div
          v-for="(cat, i) in topCategories"
          :key="cat.categoryId || i"
          class="flex items-center gap-3"
        >
          <div
            class="w-3 h-3 rounded-full flex-shrink-0"
            :style="{ backgroundColor: chartColors[i % chartColors.length] }"
          />
          <span class="text-sm text-gray-600 dark:text-gray-300 flex-1 truncate">
            {{ cat.categoryIcon }} {{ cat.categoryName }}
          </span>
          <span class="text-sm font-medium text-gray-900 dark:text-white flex-shrink-0">
            {{ formatCurrency(cat.total) }}
          </span>
          <span class="text-xs text-gray-400 flex-shrink-0 w-10 text-right">
            {{ Math.round((cat.total / total) * 100) }}%
          </span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import type { CategoryTotal } from '~/types/api'

ChartJS.register(ArcElement, Tooltip, Legend)

const props = defineProps<{
  categories: CategoryTotal[]
  total: number
}>()

const chartColors = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
]

const topCategories = computed(() => props.categories.slice(0, 8))

const chartData = computed(() => ({
  labels: topCategories.value.map(c => c.categoryName),
  datasets: [{
    data: topCategories.value.map(c => c.total),
    backgroundColor: topCategories.value.map((_, i) => chartColors[i % chartColors.length]),
    borderWidth: 2,
    borderColor: 'transparent',
    hoverBorderColor: 'white',
    hoverOffset: 4,
  }],
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '70%',
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => {
          const val = ctx.parsed
          return ` ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)}`
        },
      },
    },
  },
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}
</script>
