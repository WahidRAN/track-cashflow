<template>
  <UModal
    v-model:open="open"
    :ui="{ wrapper: 'items-end sm:items-center', content: 'rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md' }"
    title="Edit Receipt"
  >
    <template #body>
      <div class="space-y-4 px-1 pb-2">
        <UFormField label="Store name">
          <UInput v-model="form.storeName" placeholder="Store name" class="w-full" />
        </UFormField>

        <UFormField label="Date & time">
          <UInput
            v-model="form.receiptDatetime"
            type="datetime-local"
            class="w-full"
          />
        </UFormField>

        <div class="grid grid-cols-3 gap-3">
          <UFormField label="Subtotal">
            <UInput v-model.number="form.subtotal" type="number" step="0.01" min="0" placeholder="0.00" class="w-full" />
          </UFormField>
          <UFormField label="Tax">
            <UInput v-model.number="form.taxTotal" type="number" step="0.01" min="0" placeholder="0.00" class="w-full" />
          </UFormField>
          <UFormField label="Total">
            <UInput v-model.number="form.total" type="number" step="0.01" min="0" placeholder="0.00" class="w-full" />
          </UFormField>
        </div>

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
import type { Receipt } from '~/types/api'

const props = defineProps<{ receipt: Receipt }>()
const emit = defineEmits<{ updated: [receipt: Receipt] }>()

const open = defineModel<boolean>('open', { default: false })

// Convert ISO datetime to datetime-local format for the input
function toLocalDatetime(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const form = reactive({
  storeName: props.receipt.storeName,
  receiptDatetime: toLocalDatetime(props.receipt.receiptDatetime),
  subtotal: props.receipt.subtotal,
  taxTotal: props.receipt.taxTotal,
  total: props.receipt.total,
})

// Sync form when receipt prop changes
watch(() => props.receipt, (r) => {
  form.storeName = r.storeName
  form.receiptDatetime = toLocalDatetime(r.receiptDatetime)
  form.subtotal = r.subtotal
  form.taxTotal = r.taxTotal
  form.total = r.total
})

const saving = ref(false)
const error = ref<string | null>(null)

async function save() {
  saving.value = true
  error.value = null
  try {
    const updated = await $fetch<Receipt>(`/api/receipts/${props.receipt.id}`, {
      method: 'PATCH',
      body: {
        storeName: form.storeName,
        receiptDatetime: new Date(form.receiptDatetime).toISOString(),
        subtotal: form.subtotal,
        taxTotal: form.taxTotal,
        total: form.total,
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
