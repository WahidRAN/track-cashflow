export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const refreshing = ref(false)
  let startY = 0
  const pulling = ref(false)
  const pullDistance = ref(0)

  function onTouchStart(e: TouchEvent) {
    if (window.scrollY === 0) {
      startY = e.touches[0].clientY
    }
  }

  function onTouchMove(e: TouchEvent) {
    if (startY === 0) return
    const dist = e.touches[0].clientY - startY
    if (dist > 0 && window.scrollY === 0) {
      pulling.value = true
      pullDistance.value = Math.min(dist, 80)
    }
  }

  async function onTouchEnd() {
    if (pulling.value && pullDistance.value >= 60 && !refreshing.value) {
      refreshing.value = true
      await onRefresh()
      refreshing.value = false
    }
    pulling.value = false
    pullDistance.value = 0
    startY = 0
  }

  onMounted(() => {
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', onTouchEnd)
  })

  onUnmounted(() => {
    document.removeEventListener('touchstart', onTouchStart)
    document.removeEventListener('touchmove', onTouchMove)
    document.removeEventListener('touchend', onTouchEnd)
  })

  return { refreshing, pulling, pullDistance }
}
