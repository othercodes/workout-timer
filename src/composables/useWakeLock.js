import { ref, onUnmounted } from 'vue'

export function useWakeLock() {
  const wakeLock = ref(null)
  const isSupported = ref(
    typeof navigator !== 'undefined' && 'wakeLock' in navigator
  )
  const isActive = ref(false)

  const requestWakeLock = async () => {
    if (!isSupported.value) {
      return false
    }

    // Guard: don't request if already holding a lock
    if (wakeLock.value) {
      return true
    }

    try {
      const sentinel = await navigator.wakeLock.request('screen')
      
      sentinel.addEventListener('release', () => {
        isActive.value = false
        wakeLock.value = null
      })

      wakeLock.value = sentinel
      isActive.value = true

      return true
    } catch (err) {
      console.warn('Wake Lock request failed:', err.message)
      isActive.value = false
      return false
    }
  }

  const releaseWakeLock = async () => {
    if (wakeLock.value) {
      try {
        await wakeLock.value.release()
        wakeLock.value = null
        isActive.value = false
      } catch (err) {
        console.warn('Wake Lock release failed:', err.message)
      }
    }
  }

  // Cleanup on unmount
  onUnmounted(() => {
    releaseWakeLock()
  })

  return {
    isSupported,
    isActive,
    requestWakeLock,
    releaseWakeLock
  }
}
