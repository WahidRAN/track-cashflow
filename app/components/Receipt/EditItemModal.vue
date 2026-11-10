<template>
  <UModal
    v-model:open="open"
    title="Edit Item"
    :ui="{ content: 'sm:max-w-md' }"
  >
    <template #body>
      <form class="space-y-4" @submit.prevent="save">
        <UFormField label="Item name" :help="item.rawName ? `Original: ${item.rawName}` : undefined">
          <UInput v-model="form.generalizedName" placeholder="e.g. Organic Whole Milk 1L" class="w-full" />
        </UFormField>

        <UFormField label="Brand (optional)">
          <UInput v-model="form.brandName" placeholder="Brand name" class="w-full" />
        </UFormField>

        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Unit price">
            <UInput
              v-model.number="form.unitPrice"
              type="number"
              :step="amountStep"
              :inputmode="currencyFractionDigits === 0 ? 'numeric' : 'decimal'"
              min="0"
              :placeholder="amountPlaceholder"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Quantity">
            <UInput v-model.number="form.quantity" type="number" step="0.1" min="0.1" inputmode="decimal" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Category">
          <USelect
            v-model="form.categoryName"
            :items="categoryOptions"
            class="w-full"
          />
        </UFormField>

        <UAlert v-if="nameChanged" color="info" variant="subtle" description="Price history will be recalculated for the new item name." />
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
import type { ReceiptItem } from '~/types/api'

const props = defineProps<{ item: ReceiptItem }>()
const emit = defineEmits<{ updated: [item: ReceiptItem] }>()

const open = defineModel<boolean>('open', { default: false })

const { amountStep, amountPlaceholder, currencyFractionDigits, roundCurrency } = useFormat()

const categoryOptions = [
  'Groceries', 'Personal Care', 'Household', 'Pharmacy',
  'Restaurant', 'Coffee', 'Clothing', 'Electronics',
  'Transportation', 'Entertainment', 'Other',
]

function formFrom(i: ReceiptItem) {
  return {
    generalizedName: i.generalizedName,
    brandName: i.brandName || '',
    // v-model.number leaves '' in place when the input is cleared
    unitPrice: i.unitPrice as number | string,
    quantity: (i.quantity || 1) as number | string,
    categoryName: i.categoryName || 'Other',
  }
}

const form = reactive(formFrom(props.item))
const saving = ref(false)
const error = ref<string | null>(null)

function resetForm() {
  Object.assign(form, formFrom(props.item))
  error.value = null
}

// Re-seed on every open so abandoned edits don't linger, and when a different item is passed in
watch(open, (isOpen) => { if (isOpen) resetForm() })
watch(() => props.item, resetForm)

const nameChanged = computed(() => form.generalizedName.trim() !== props.item.generalizedName)

function toNumber(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

async function save() {
  if (saving.value) return
  error.value = null

  const generalizedName = form.generalizedName.trim()
  const unitPrice = toNumber(form.unitPrice)
  const quantity = toNumber(form.quantity)
  if (!generalizedName) return void (error.value = 'Item name is required')
  if (unitPrice === null || unitPrice < 0) return void (error.value = 'Enter a valid unit price')
  if (quantity === null || quantity <= 0) return void (error.value = 'Quantity must be greater than 0')

  // Keep the receipt's own line total (which may include a discount) unless price/qty were edited
  const priceOrQtyChanged = unitPrice !== props.item.unitPrice || quantity !== (props.item.quantity || 1)
  const lineTotal = priceOrQtyChanged ? roundCurrency(unitPrice * quantity) : props.item.lineTotal

  saving.value = true
  try {
    const updated = await $fetch<ReceiptItem>(`/api/items/${props.item.id}`, {
      method: 'PATCH',
      body: {
        generalizedName,
        brandName: form.brandName.trim() || null,
        unitPrice,
        quantity,
        lineTotal,
        categoryName: form.categoryName,
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
