<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <slot />
    <!-- Bottom navigation for mobile -->
    <nav class="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700"
         style="padding-bottom: env(safe-area-inset-bottom, 0px)">
      <div class="flex justify-around items-center h-16 max-w-lg mx-auto px-4">
        <NuxtLink to="/" class="flex flex-col items-center gap-1 text-xs py-2 px-3" active-class="text-emerald-600">
          <UIcon name="i-heroicons-home" class="w-6 h-6" />
          <span>Home</span>
        </NuxtLink>
        <NuxtLink to="/capture" class="flex flex-col items-center gap-1 text-xs py-2 px-3" active-class="text-emerald-600">
          <div class="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center -mt-6 shadow-lg">
            <UIcon name="i-heroicons-camera" class="w-6 h-6 text-white" />
          </div>
          <span class="mt-1">Capture</span>
        </NuxtLink>
        <NuxtLink to="/history" class="flex flex-col items-center gap-1 text-xs py-2 px-3" active-class="text-emerald-600">
          <UIcon name="i-heroicons-clock" class="w-6 h-6" />
          <span>History</span>
        </NuxtLink>
      </div>
    </nav>
    <!-- Spacer for bottom nav (nav height + safe area) -->
    <div style="height: calc(4rem + env(safe-area-inset-bottom, 0px))" />
  </div>
</template>
