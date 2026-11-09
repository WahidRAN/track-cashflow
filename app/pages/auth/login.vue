<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <div class="text-4xl mb-3">💰</div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Track Cashflow</h1>
        <p class="text-gray-500 mt-1">Sign in to continue</p>
      </div>
      <UCard>
        <form @submit.prevent="handleLogin" class="space-y-4">
          <UFormField label="Email" name="email">
            <UInput
              v-model="email"
              type="email"
              placeholder="your@email.com"
              autocomplete="email"
              required
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            block
            color="primary"
            :loading="loading"
          >
            Send magic link
          </UButton>
        </form>
        <p v-if="sent" class="text-center text-sm text-emerald-600 mt-4">
          ✓ Check your email for the login link
        </p>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const email = ref('')
const loading = ref(false)
const sent = ref(false)

async function handleLogin() {
  loading.value = true
  const { error } = await supabase.auth.signInWithOtp({
    email: email.value,
    options: { emailRedirectTo: `${useRequestURL().origin}/auth/confirm` },
  })
  loading.value = false
  if (!error) sent.value = true
}
</script>
