<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
    <div class="w-full max-w-sm text-center">
      <!-- Supabase redirected back with an error (expired / already-used link, …) -->
      <template v-if="errorMessage && !user">
        <div class="w-14 h-14 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-7 h-7 text-red-500" />
        </div>
        <h1 class="text-lg font-semibold text-gray-900 dark:text-white">That login link didn't work</h1>
        <p class="text-sm text-gray-500 mt-2">{{ errorMessage }}</p>
        <UButton to="/auth/login" color="primary" class="mt-6" block>
          Back to login
        </UButton>
      </template>

      <!-- Waiting for @nuxtjs/supabase to finish the PKCE code exchange -->
      <template v-else>
        <div class="w-8 h-8 mx-auto mb-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p class="text-gray-500">Signing you in...</p>
        <div v-if="slow" class="mt-6 text-sm text-gray-500 space-y-3">
          <p>
            This is taking longer than expected. The link may have expired, or it was opened in a
            different browser from the one you requested it in.
          </p>
          <NuxtLink to="/auth/login" class="inline-block text-emerald-600 font-medium">
            Request a new link
          </NuxtLink>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
// This route is the module's `redirectOptions.callback`, which @nuxtjs/supabase renders client-only
// (routeRules ssr: false). The browser client exchanges `?code=` for a session during plugin init
// and `useSupabaseUser()` is populated once that finishes — so wait for it instead of redirecting
// straight away (an immediate navigateTo('/') can beat the exchange and bounce back to /auth/login).
definePageMeta({ layout: false })

const user = useSupabaseUser()
const route = useRoute()
const redirectInfo = useSupabaseCookieRedirect()

function firstString(v: unknown): string | null {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' && s ? s : null
}

// PKCE errors arrive as query params; implicit-flow errors arrive in the hash.
const errorMessage = computed(() => {
  const hash = new URLSearchParams(route.hash.replace(/^#/, ''))
  return firstString(route.query.error_description)
    || hash.get('error_description')
    || firstString(route.query.error)
    || hash.get('error')
    || null
})

// Only follow same-origin app paths; never loop back into /auth/*
function safeRedirect(path: string | null | undefined): string {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/auth')) return '/'
  return path
}

watch(user, (u) => {
  if (!u) return
  // Saved by the module's auth middleware when `redirectOptions.saveRedirectToCookie` is enabled
  const saved = redirectInfo.pluck()
  return navigateTo(safeRedirect(saved), { replace: true })
}, { immediate: true })

// If nothing happens (no code verifier in this browser, network issue), offer a way out
const slow = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  timer = setTimeout(() => { slow.value = true }, 8000)
})
onBeforeUnmount(() => clearTimeout(timer))
</script>
