<template>
  <UModal
    v-model:open="open"
    :ui="{ wrapper: 'items-end sm:items-center', content: 'rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md' }"
    title="Edit Item"
  >
    <template #body>
      <div class="space-y-4 px-1 pb-2">
        <UFormField label="Item name">
          <UInput v-model="form.generalizedName" placeholder="e.g. Organic Whole Milk 1L" class="w-full" />
          <template #hint>
            <span class="text-xs text-gray-400">Original: {{ item.rawName }}</span>
          </template>
        </UFormField>

        <UFormField label="Brand (optional)">
          <UInput v-model="form.brandName" placeholder="Brand name" class="w-full" />
        </UFormField>

        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Unit price">
            <UInput v-model.number="form.unitPrice" type="number" step="0.01" min="0" class="w-full" />
          </UFormField>
          <UFormField label="Quantity">
            <UInput v-model.number="form.quantity" type="number" step="0.1" min="0.1" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Category">
          <USelect
            v-model="form.categoryName"
            :items="categoryOptions"
            class="w-full"
          />
        </UFormField>

        <UAlert v-if="nameChanged" color="info" description="Price history will be recalculated for the new item name." />
        <UAlert v-if="error" color="error" :description="error" />
      </div>
    </template>

    <template #footer>
      <div class="flex gap-3 w-full">
        <UButton variant="ghost" color="neutral" class="flex-1" @click="open = false">
          Cancel
        </UButton>
        <UButton color="primary" class="flex-1" :loading="saving" @click="save">
          Save
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { ReceiptItem } from '~/types/api'

const props = defineProps<{ item: ReceiptItem }>()
const emit = defineEmits<{ updated: [item: ReceiptItem] }>()

const open = defineModel<boolean>('open', { default: false })

const categoryOptions = [
  'Groceries', 'Personal Care', 'Household', 'Pharmacy',
  'Restaurant', 'Coffee', 'Clothing', 'Electronics',
  'Transportation', 'Entertainment', 'Other',
]

const form = reactive({
  generalizedName: props.item.generalizedName,
  brandName: props.item.brandName || '',
  unitPrice: props.item.unitPrice,
  quantity: props.item.quantity || 1,
  categoryName: props.item.categoryName || 'Other',
})

watch(() => props.item, (i) => {
  form.generalizedName = i.generalizedName
  form.brandName = i.brandName || ''
  form.unitPrice = i.unitPrice
  form.quantity = i.quantity || 1
  form.categoryName = i.categoryName || 'Other'
})

const nameChanged = computed(() => form.generalizedName !== props.item.generalizedName)
const saving = ref(false)
const error = ref<string | null>(null)

async function save() {
  saving.value = true
  error.value = null
  try {
    const lineTotal = form.unitPrice * form.quantity
    const updated = await $fetch<ReceiptItem>(`/api/items/${props.item.id}`, {
      method: 'PATCH',
      body: {
        generalizedName: form.generalizedName,
        brandName: form.brandName || null,
        unitPrice: form.unitPrice,
        quantity: form.quantity,
        lineTotal,
        categoryName: form.categoryName,
      },
    })
    emit('updated', updated)
    open.value = false
  } catch (e: any) {
    error.value = e.message || 'Failed to save'
  } finally {
    saving.value = false
  }
}
</script>
