import { ref, computed, watch, onUnmounted } from 'vue'
import { useAudio } from './useAudio'

export function useWorkout(workoutData) {
  const { playCountdown, playStart, playChange, playPhaseEnd, initAudio } = useAudio()

  // State
  const phaseIndex = ref(0)
  const exerciseIndex = ref(0)
  const round = ref(1)
  const timeLeft = ref(0)
  const isResting = ref(false)
  const isRoundRest = ref(false)
  const isRunning = ref(false)
  const isStarted = ref(false)
  const isFinished = ref(false)
  const soundEnabled = ref(true)

  let timerInterval = null

  // Computed
  const currentPhase = computed(() => workoutData.phases[phaseIndex.value])
  const currentExercise = computed(() => currentPhase.value?.exercises[exerciseIndex.value])
  const totalExercises = computed(() => currentPhase.value?.exercises.length || 0)
  const totalRounds = computed(() => currentPhase.value?.rounds || 1)

  const progress = computed(() => {
    const phaseProgress = (exerciseIndex.value + (isResting.value ? 0.5 : 0)) / totalExercises.value
    return ((phaseIndex.value + phaseProgress) / workoutData.phases.length) * 100
  })

  const nextInfo = computed(() => {
    if (!isResting.value && !isRoundRest.value) return null

    if (isRoundRest.value) {
      return { label: 'Siguiente ronda', name: currentPhase.value.exercises[0].name }
    }

    const nextEx = exerciseIndex.value + 1
    if (nextEx < totalExercises.value) {
      return { label: 'Siguiente', name: currentPhase.value.exercises[nextEx].name }
    }

    if (round.value < totalRounds.value) {
      return { label: 'Siguiente ronda', name: currentPhase.value.exercises[0].name }
    }

    const nextPhase = workoutData.phases[phaseIndex.value + 1]
    if (nextPhase) {
      return { label: `Siguiente: ${nextPhase.name}`, name: nextPhase.exercises[0].name }
    }

    return null
  })

  // Methods
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const nextStep = () => {
    if (isRoundRest.value) {
      isRoundRest.value = false
      exerciseIndex.value = 0
      timeLeft.value = currentPhase.value.exercises[0].duration
      if (soundEnabled.value) playStart()
      return
    }

    if (isResting.value) {
      const nextEx = exerciseIndex.value + 1

      if (nextEx >= totalExercises.value) {
        if (round.value < totalRounds.value) {
          round.value++
          if (currentPhase.value.restBetweenRounds) {
            isRoundRest.value = true
            timeLeft.value = currentPhase.value.restBetweenRounds
            if (soundEnabled.value) playChange()
          } else {
            exerciseIndex.value = 0
            timeLeft.value = currentPhase.value.exercises[0].duration
            if (soundEnabled.value) playStart()
          }
        } else {
          goToNextPhase()
        }
      } else {
        exerciseIndex.value = nextEx
        timeLeft.value = currentPhase.value.exercises[nextEx].duration
        if (soundEnabled.value) playStart()
      }

      isResting.value = false
      return
    }

    // End of exercise
    if (currentExercise.value.restAfter > 0) {
      isResting.value = true
      timeLeft.value = currentExercise.value.restAfter
      if (soundEnabled.value) playChange()
    } else {
      const nextEx = exerciseIndex.value + 1

      if (nextEx >= totalExercises.value) {
        if (round.value < totalRounds.value) {
          round.value++
          if (currentPhase.value.restBetweenRounds) {
            isRoundRest.value = true
            timeLeft.value = currentPhase.value.restBetweenRounds
            if (soundEnabled.value) playChange()
          } else {
            exerciseIndex.value = 0
            timeLeft.value = currentPhase.value.exercises[0].duration
            if (soundEnabled.value) playChange()
          }
        } else {
          goToNextPhase()
        }
      } else {
        exerciseIndex.value = nextEx
        timeLeft.value = currentPhase.value.exercises[nextEx].duration
        if (soundEnabled.value) playChange()
      }
    }
  }

  const goToNextPhase = () => {
    const nextPhaseIdx = phaseIndex.value + 1

    if (nextPhaseIdx >= workoutData.phases.length) {
      isFinished.value = true
      isRunning.value = false
      stopTimer()
      if (soundEnabled.value) playPhaseEnd()
    } else {
      if (soundEnabled.value) playPhaseEnd()
      phaseIndex.value = nextPhaseIdx
      exerciseIndex.value = 0
      round.value = 1
      timeLeft.value = workoutData.phases[nextPhaseIdx].exercises[0].duration
    }
  }

  const prevStep = () => {
    if (isRoundRest.value) {
      isRoundRest.value = false
      const lastEx = totalExercises.value - 1
      exerciseIndex.value = lastEx
      timeLeft.value = currentPhase.value.exercises[lastEx].duration
      return
    }

    if (isResting.value) {
      isResting.value = false
      timeLeft.value = currentExercise.value.duration
      return
    }

    if (exerciseIndex.value > 0) {
      exerciseIndex.value--
      timeLeft.value = currentPhase.value.exercises[exerciseIndex.value].duration
    } else if (round.value > 1) {
      round.value--
      const lastEx = totalExercises.value - 1
      exerciseIndex.value = lastEx
      timeLeft.value = currentPhase.value.exercises[lastEx].duration
    } else if (phaseIndex.value > 0) {
      const prevPhase = workoutData.phases[phaseIndex.value - 1]
      phaseIndex.value--
      round.value = prevPhase.rounds
      const lastEx = prevPhase.exercises.length - 1
      exerciseIndex.value = lastEx
      timeLeft.value = prevPhase.exercises[lastEx].duration
    }
  }

  const startTimer = () => {
    if (timerInterval) return

    timerInterval = setInterval(() => {
      if (timeLeft.value <= 1) {
        nextStep()
        return
      }

      if (timeLeft.value <= 4 && timeLeft.value > 1 && soundEnabled.value) {
        playCountdown(timeLeft.value - 1)
      }

      timeLeft.value--
    }, 1000)
  }

  const stopTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
  }

  const toggleRunning = () => {
    isRunning.value = !isRunning.value
  }

  const start = () => {
    initAudio()
    timeLeft.value = workoutData.phases[0].exercises[0].duration
    isStarted.value = true
    isRunning.value = true
    if (soundEnabled.value) playStart()
  }

  const restart = () => {
    stopTimer()
    phaseIndex.value = 0
    exerciseIndex.value = 0
    round.value = 1
    timeLeft.value = 0
    isResting.value = false
    isRoundRest.value = false
    isRunning.value = false
    isStarted.value = false
    isFinished.value = false
  }

  const toggleSound = () => {
    soundEnabled.value = !soundEnabled.value
  }

  // Watch running state
  watch(isRunning, (running) => {
    if (running && !isFinished.value) {
      startTimer()
    } else {
      stopTimer()
    }
  })

  // Cleanup
  onUnmounted(() => {
    stopTimer()
  })

  return {
    // State
    phaseIndex,
    exerciseIndex,
    round,
    timeLeft,
    isResting,
    isRoundRest,
    isRunning,
    isStarted,
    isFinished,
    soundEnabled,

    // Computed
    currentPhase,
    currentExercise,
    totalExercises,
    totalRounds,
    progress,
    nextInfo,

    // Methods
    formatTime,
    nextStep,
    prevStep,
    toggleRunning,
    start,
    restart,
    toggleSound
  }
}