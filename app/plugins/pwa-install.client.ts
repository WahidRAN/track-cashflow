// Capture the one-shot `beforeinstallprompt` event as early as possible so the dashboard's
// "Add to Home Screen" banner works no matter which page the app was opened on.
export default defineNuxtPlugin((nuxtApp) => {
  const { canInstall, installed } = usePwaInstall()

  if (window.matchMedia?.('(display-mode: standalone)').matches) {
    installed.value = true
    return
  }

  // Flip the banner on only after hydration so SSR markup and the first client render match.
  // (Uses the captured nuxtApp: this runs from a window event, outside any Nuxt context.)
  function afterHydration(fn: () => void) {
    if (nuxtApp.isHydrating) nuxtApp.hooks.hookOnce('app:suspense:resolve', fn)
    else fn()
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    setPwaInstallPrompt(e)
    afterHydration(() => {
      canInstall.value = !isPwaInstallDismissed()
    })
  })

  window.addEventListener('appinstalled', () => {
    setPwaInstallPrompt(null)
    installed.value = true
    canInstall.value = false
  })
})
