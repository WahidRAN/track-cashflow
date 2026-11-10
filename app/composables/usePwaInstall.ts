interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa-dismiss'
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000

// The browser fires `beforeinstallprompt` once, shortly after load — usually before the dashboard
// mounts (e.g. on /auth/confirm). plugins/pwa-install.client.ts captures it at startup and parks it
// here; this module-level value only ever exists in the browser.
let deferredPrompt: BeforeInstallPromptEvent | null = null

export function isPwaInstallDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY))
    return !!at && Date.now() - at < DISMISS_FOR_MS
  } catch {
    // Storage can throw (private mode, blocked site data)
    return false
  }
}

export function setPwaInstallPrompt(e: Event | null) {
  deferredPrompt = e as BeforeInstallPromptEvent | null
}

export function usePwaInstall() {
  const canInstall = useState<boolean>('pwa-can-install', () => false)
  const installed = useState<boolean>('pwa-installed', () => false)

  async function install() {
    if (!deferredPrompt) return
    const prompt = deferredPrompt
    deferredPrompt = null
    canInstall.value = false
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') installed.value = true
  }

  function dismiss() {
    canInstall.value = false
    // Don't show again for 7 days
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // ignore — the banner just comes back next visit
    }
  }

  return { canInstall, installed, install, dismiss }
}
