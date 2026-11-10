<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <div class="text-4xl mb-3">💰</div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Track Cashflow</h1>
        <p class="text-gray-500 mt-1">Sign in to continue</p>
      </div>
      <UCard>
        <form class="space-y-4" @submit.prevent="handleLogin">
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
            :disabled="!email.trim()"
          >
            Send magic link
          </UButton>
        </form>

        <p v-if="sent" class="text-center text-sm text-emerald-600 mt-4">
          ✓ Check {{ sentTo }} for the login link
        </p>
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-heroicons-exclamation-circle"
          :description="errorMessage"
          class="mt-4"
        />
      </UCard>

      <p v-if="isDev" class="text-center text-xs text-gray-400 mt-4">
        Running locally? Open Mailpit at
        <a :href="mailpitUrl" target="_blank" rel="noopener" class="text-emerald-600 underline">{{ mailpitUrl }}</a>
        to find the login email.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const supabaseUrl = useRuntimeConfig().public.supabase?.url as string | undefined

const isDev = import.meta.dev
const mailpitUrl = 'http://127.0.0.1:54324'

const email = ref('')
const loading = ref(false)
const sent = ref(false)
const sentTo = ref('')
const errorMessage = ref<string | null>(null)

// Already signed in (e.g. navigated back to this page) — nothing to do here
watch(user, (u) => {
  if (u) return navigateTo('/', { replace: true })
}, { immediate: true })

async function handleLogin() {
  errorMessage.value = null
  sent.value = false
  loading.value = true
  const address = email.value.trim()
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      // Computed in the browser so it matches the origin the user actually opened
      // (localhost:3000, a LAN IP from a phone, or the deployed domain)
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    })
    if (error) {
      errorMessage.value = describeAuthError(error)
    } else {
      sent.value = true
      sentTo.value = address
    }
  } catch (e) {
    errorMessage.value = getErrorMessage(e, 'Could not send the login link')
  } finally {
    loading.value = false
  }
}

function describeAuthError(error: { message: string, status?: number, name?: string }): string {
  const unreachable = error.name === 'AuthRetryableFetchError' || error.status === 0 || /failed to fetch|fetch failed|networkerror/i.test(error.message)
  if (unreachable && isDev) {
    return `Could not reach Supabase at ${supabaseUrl || '(NUXT_PUBLIC_SUPABASE_URL not set)'}. Is the local stack running (npm run db:start)?`
  }
  return error.message || 'Could not send the login link'
}
</script>
