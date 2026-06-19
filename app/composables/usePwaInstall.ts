export function usePwaInstall() {
  const canInstall = ref(false)
  const installed = ref(false)
  let deferredPrompt: any = null

  onMounted(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      installed.value = true
      return
    }

    // Don't show if dismissed within last 7 days
    const dismissed = localStorage.getItem('pwa-dismiss')
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) {
      return
    }

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault()
      deferredPrompt = e
      canInstall.value = true
    })

    window.addEventListener('appinstalled', () => {
      installed.value = true
      canInstall.value = false
    })
  })

  async function install() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') installed.value = true
    deferredPrompt = null
    canInstall.value = false
  }

  function dismiss() {
    canInstall.value = false
    // Don't show again for 7 days
    localStorage.setItem('pwa-dismiss', String(Date.now()))
  }

  return { canInstall, installed, install, dismiss }
}
