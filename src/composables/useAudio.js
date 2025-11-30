import { ref } from 'vue'

export function useAudio() {
  const audioContext = ref(null)

  const getContext = () => {
    if (!audioContext.value) {
      audioContext.value = new (window.AudioContext || window.webkitAudioContext)()
    }
    return audioContext.value
  }

  const beep = (freq, duration, type = 'sine', volume = 0.3) => {
    try {
      const ctx = getContext()
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.frequency.value = freq
      oscillator.type = type

      gainNode.gain.setValueAtTime(volume, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000)

      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + duration / 1000)
    } catch (e) {
      console.warn('Audio not available:', e)
    }
  }

  const playCountdown = (num) => {
    const frequencies = { 3: 600, 2: 700, 1: 800 }
    beep(frequencies[num] || 600, 200)
  }

  const playStart = () => {
    beep(1000, 300, 'square')
  }

  const playChange = () => {
    beep(880, 150, 'sine', 0.4)
    setTimeout(() => beep(1100, 200, 'sine', 0.4), 150)
  }

  const playPhaseEnd = () => {
    beep(800, 200, 'sine', 0.3)
    setTimeout(() => beep(1000, 200, 'sine', 0.3), 200)
    setTimeout(() => beep(1200, 300, 'sine', 0.3), 400)
  }

  const initAudio = () => {
    getContext()
  }

  return {
    playCountdown,
    playStart,
    playChange,
    playPhaseEnd,
    initAudio
  }
}