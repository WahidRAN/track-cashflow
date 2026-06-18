<template>
  <div class="min-h-screen flex items-center justify-center">
    <p class="text-gray-500">Confirming login...</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })
// @nuxtjs/supabase handles the token exchange automatically
// Just redirect to home
await navigateTo('/')
</script>
