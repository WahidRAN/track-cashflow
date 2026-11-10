<template>
  <UModal
    v-model:open="open"
    title="Edit Receipt"
    :ui="{ content: 'sm:max-w-md' }"
  >
    <template #body>
      <form class="space-y-4" @submit.prevent="save">
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
            <UInput
              v-model.number="form.subtotal"
              type="number"
              :step="amountStep"
              :inputmode="inputMode"
              min="0"
              :placeholder="amountPlaceholder"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Tax">
            <UInput
              v-model.number="form.taxTotal"
              type="number"
              :step="amountStep"
              :inputmode="inputMode"
              min="0"
              :placeholder="amountPlaceholder"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Total">
            <UInput
              v-model.number="form.total"
              type="number"
              :step="amountStep"
              :inputmode="inputMode"
              min="0"
              :placeholder="amountPlaceholder"
              class="w-full"
            />
          </UFormField>
        </div>

        <UAlert v-if="error" color="error" variant="subtle" :description="error" />

        <!-- Lets the mobile keyboard's "Go" submit the form -->
        <button type="submit" class="hidden" />
      </form>
    </template>

    <template #footer>
      <div class="flex gap-3 w-full">
        <UButton variant="ghost" color="neutral" class="flex-1 justify-center" @click="() => { open = false }">
          Cancel
        </UButton>
        <UButton color="primary" class="flex-1 justify-center" :loading="saving" @click="save">
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

const { amountStep, amountPlaceholder, currencyFractionDigits } = useFormat()
const inputMode = currencyFractionDigits === 0 ? 'numeric' : 'decimal'

// ISO datetime → value for <input type="datetime-local"> (browser-local time)
function toLocalDatetime(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formFrom(r: Receipt) {
  return {
    storeName: r.storeName || '',
    receiptDatetime: toLocalDatetime(r.receiptDatetime),
    // '' = empty input (UInput's model can't be null; v-model.number also leaves '' when cleared)
    subtotal: (r.subtotal ?? '') as number | string,
    taxTotal: (r.taxTotal ?? '') as number | string,
    total: (r.total ?? '') as number | string,
  }
}

const form = reactive(formFrom(props.receipt))
const saving = ref(false)
const error = ref<string | null>(null)

function resetForm() {
  Object.assign(form, formFrom(props.receipt))
  error.value = null
}

// Re-seed on every open so abandoned edits don't linger, and when the receipt prop changes
watch(open, (isOpen) => { if (isOpen) resetForm() })
watch(() => props.receipt, resetForm)

function toNumber(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

async function save() {
  if (saving.value) return
  error.value = null

  const storeName = form.storeName.trim()
  const when = form.receiptDatetime ? new Date(form.receiptDatetime) : null
  const subtotal = toNumber(form.subtotal)
  const taxTotal = toNumber(form.taxTotal)
  const total = toNumber(form.total)
  if (!storeName) return void (error.value = 'Store name is required')
  if (!when || Number.isNaN(when.getTime())) return void (error.value = 'Enter a valid date and time')
  if (total === null || total < 0) return void (error.value = 'Enter a valid total')
  if ((subtotal !== null && subtotal < 0) || (taxTotal !== null && taxTotal < 0)) {
    return void (error.value = 'Amounts cannot be negative')
  }

  saving.value = true
  try {
    const updated = await $fetch<Receipt>(`/api/receipts/${props.receipt.id}`, {
      method: 'PATCH',
      body: {
        storeName,
        receiptDatetime: when.toISOString(),
        subtotal,
        taxTotal,
        total,
      },
    })
    emit('updated', updated)
    open.value = false
  } catch (e) {
    error.value = getErrorMessage(e, 'Failed to save')
  } finally {
    saving.value = false
  }
}
</script>
