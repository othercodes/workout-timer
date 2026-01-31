import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAudio } from './useAudio'
import { useWakeLock } from './useWakeLock'

export function useWorkout(workoutsList) {
  const { playCountdown, playStart, playChange, playPhaseEnd, initAudio } = useAudio()
  const { isSupported: wakeLockSupported, isActive: wakeLockActive, requestWakeLock, releaseWakeLock } = useWakeLock()

  // Selection State
  const selectedWorkoutId = ref(null)
  const selectedWorkout = computed(() =>
    workoutsList.find(w => w.id === selectedWorkoutId.value) || null
  )

  // Workout State
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

  // Bilateral Exercise State
  const currentSide = ref(null) // 'left' | 'right' | null
  const isSwitchingSides = ref(false)

  // Partner Mode State
  const partnerMode = ref(false)
  const PARTNER_REST_BONUS = 5 // Extra seconds for equipment handoff

  let timerInterval = null

  // Computed
  const currentPhase = computed(() => selectedWorkout.value?.phases[phaseIndex.value])
  const currentExercise = computed(() => currentPhase.value?.exercises[exerciseIndex.value])
  const totalExercises = computed(() => currentPhase.value?.exercises.length || 0)
  const totalRounds = computed(() => currentPhase.value?.rounds || 1)

  // Check if current exercise is bilateral
  const isBilateralExercise = computed(() => currentExercise.value?.bilateral === true)

  // Partner Mode: Check if currently in workout phase (partner mode only applies here)
  const isWorkoutPhase = computed(() => currentPhase.value?.type === 'workout')

  // Partner Mode: Get partner's exercise (offset by 1, wraps around)
  const partnerExerciseIndex = computed(() => {
    if (!partnerMode.value || !isWorkoutPhase.value) return null
    return (exerciseIndex.value + 1) % totalExercises.value
  })

  const partnerExercise = computed(() => {
    if (partnerExerciseIndex.value === null) return null
    return currentPhase.value?.exercises[partnerExerciseIndex.value]
  })

  // Partner Mode: Get next exercise for partner (offset by 2 from current)
  const partnerNextExerciseIndex = computed(() => {
    if (!partnerMode.value || !isWorkoutPhase.value) return null
    return (exerciseIndex.value + 2) % totalExercises.value
  })

  const partnerNextExercise = computed(() => {
    if (partnerNextExerciseIndex.value === null) return null
    return currentPhase.value?.exercises[partnerNextExerciseIndex.value]
  })

  // Partner Mode: Get the max duration for the current exercise pair
  const partnerModeMaxDuration = computed(() => {
    if (!partnerMode.value || !isWorkoutPhase.value) return null
    if (!currentExercise.value || !partnerExercise.value) return null
    const durationA = getEffectiveDuration(currentExercise.value)
    const durationB = getEffectiveDuration(partnerExercise.value)
    return Math.max(durationA, durationB)
  })

  // Partner Mode: Elapsed time since exercise started
  const partnerModeElapsed = computed(() => {
    if (!partnerModeMaxDuration.value) return 0
    return partnerModeMaxDuration.value - timeLeft.value
  })

  // Partner Mode: Compute Person A's bilateral state from elapsed time
  const personABilateralState = computed(() => {
    if (!partnerMode.value || !isWorkoutPhase.value || isResting.value || isRoundRest.value) return null
    if (!currentExercise.value?.bilateral) return null
    
    const perSide = currentExercise.value.perSideDuration
    const switchRest = currentExercise.value.switchRestDuration || 5
    const elapsed = partnerModeElapsed.value
    
    if (elapsed < perSide) return { side: 'left', isSwitching: false }
    if (elapsed < perSide + switchRest) return { side: 'left', isSwitching: true }
    return { side: 'right', isSwitching: false }
  })

  // Partner Mode: Compute Person B's bilateral state from elapsed time
  const personBBilateralState = computed(() => {
    if (!partnerMode.value || !isWorkoutPhase.value || isResting.value || isRoundRest.value) return null
    if (!partnerExercise.value?.bilateral) return null
    
    const perSide = partnerExercise.value.perSideDuration
    const switchRest = partnerExercise.value.switchRestDuration || 5
    const elapsed = partnerModeElapsed.value
    
    if (elapsed < perSide) return { side: 'left', isSwitching: false }
    if (elapsed < perSide + switchRest) return { side: 'left', isSwitching: true }
    return { side: 'right', isSwitching: false }
  })

  // Partner Mode: Check if Person A finished early (their exercise is shorter)
  const personAFinishedEarly = computed(() => {
    if (!partnerMode.value || !isWorkoutPhase.value || isResting.value || isRoundRest.value) return false
    if (!currentExercise.value || !partnerExercise.value) return false
    const durationA = getEffectiveDuration(currentExercise.value)
    return partnerModeElapsed.value >= durationA
  })

  // Partner Mode: Check if Person B finished early (their exercise is shorter)
  const partnerFinishedEarly = computed(() => {
    if (!partnerMode.value || !isWorkoutPhase.value || isResting.value || isRoundRest.value) return false
    if (!currentExercise.value || !partnerExercise.value) return false
    const durationB = getEffectiveDuration(partnerExercise.value)
    return partnerModeElapsed.value >= durationB
  })

  const progress = computed(() => {
    if (!selectedWorkout.value) return 0
    const phaseProgress = (exerciseIndex.value + (isResting.value ? 0.5 : 0)) / totalExercises.value
    return ((phaseIndex.value + phaseProgress) / selectedWorkout.value.phases.length) * 100
  })

  const nextInfo = computed(() => {
    if (!selectedWorkout.value) return null

    // During switch rest, show the other side
    if (isSwitchingSides.value) {
      return { label: 'Siguiente lado', name: '➡️ DERECHA' }
    }

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

    const nextPhase = selectedWorkout.value.phases[phaseIndex.value + 1]
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

  // Helper to get TOTAL duration for an exercise (for display/overview)
  // For bilateral: perSideDuration * 2 + switchRestDuration
  // For non-bilateral: duration
  const getEffectiveDuration = (exercise) => {
    if (exercise.bilateral && exercise.perSideDuration) {
      const switchRest = exercise.switchRestDuration || 5
      return (exercise.perSideDuration * 2) + switchRest
    }
    return exercise.duration
  }

  // Helper to get the INITIAL timer value when starting an exercise
  // For bilateral: perSideDuration (starts with left side)
  // For non-bilateral: duration
  const getExerciseDuration = (exercise) => {
    if (exercise.bilateral && exercise.perSideDuration) {
      return exercise.perSideDuration
    }
    return exercise.duration
  }

  // Helper to initialize bilateral state when starting an exercise
  const initializeExercise = (exercise) => {
    if (exercise.bilateral) {
      currentSide.value = 'left'
      return exercise.perSideDuration || exercise.duration
    } else {
      currentSide.value = null
      return exercise.duration
    }
  }

  // Partner Mode: Get max duration between current and partner exercise
  const getPartnerModeDuration = (exerciseA, exerciseB) => {
    const durationA = getExerciseDuration(exerciseA)
    const durationB = getExerciseDuration(exerciseB)
    return Math.max(durationA, durationB)
  }

  // Partner Mode: Get max rest duration between exercises + handoff bonus
  const getPartnerModeRestDuration = (exerciseA, exerciseB) => {
    const restA = exerciseA.restAfter || 0
    const restB = exerciseB.restAfter || 0
    return Math.max(restA, restB) + PARTNER_REST_BONUS
  }

  // Helper to initialize exercise with partner mode support
  const initializeExerciseWithPartnerMode = (exercise, partnerEx) => {
    // In partner mode during workout: use effective duration (full bilateral) and skip side tracking
    if (partnerMode.value && partnerEx) {
      // Don't set currentSide - bilateral state is computed from elapsed time
      currentSide.value = null
      isSwitchingSides.value = false
      const durationA = getEffectiveDuration(exercise)
      const durationB = getEffectiveDuration(partnerEx)
      return Math.max(durationA, durationB)
    }
    
    // Normal mode: track sides for bilateral exercises
    if (exercise.bilateral) {
      currentSide.value = 'left'
      return exercise.perSideDuration || exercise.duration
    } else {
      currentSide.value = null
      return exercise.duration
    }
  }

  const nextStep = () => {
    if (!selectedWorkout.value) return

    // Handle end of switch rest (transition to right side) - only in normal mode
    // In partner mode, bilateral state is computed from elapsed time, not state transitions
    if (isSwitchingSides.value && !(partnerMode.value && isWorkoutPhase.value)) {
      isSwitchingSides.value = false
      currentSide.value = 'right'
      timeLeft.value = currentExercise.value.perSideDuration
      if (soundEnabled.value) playStart()
      return
    }

    // Handle round rest
    if (isRoundRest.value) {
      isRoundRest.value = false
      exerciseIndex.value = 0
      const firstExercise = currentPhase.value.exercises[0]
      // In partner mode, partner starts at exercise 1
      const partnerEx = partnerMode.value && isWorkoutPhase.value 
        ? currentPhase.value.exercises[1 % totalExercises.value] 
        : null
      timeLeft.value = initializeExerciseWithPartnerMode(firstExercise, partnerEx)
      if (soundEnabled.value) playStart()
      return
    }

    // Handle regular rest (between exercises)
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
            const firstExercise = currentPhase.value.exercises[0]
            const partnerEx = partnerMode.value && isWorkoutPhase.value 
              ? currentPhase.value.exercises[1 % totalExercises.value] 
              : null
            timeLeft.value = initializeExerciseWithPartnerMode(firstExercise, partnerEx)
            if (soundEnabled.value) playStart()
          }
        } else {
          goToNextPhase()
        }
      } else {
        exerciseIndex.value = nextEx
        const nextExercise = currentPhase.value.exercises[nextEx]
        // Partner is at nextEx + 1
        const partnerEx = partnerMode.value && isWorkoutPhase.value 
          ? currentPhase.value.exercises[(nextEx + 1) % totalExercises.value] 
          : null
        timeLeft.value = initializeExerciseWithPartnerMode(nextExercise, partnerEx)
        if (soundEnabled.value) playStart()
      }

      isResting.value = false
      return
    }

    // End of exercise (or side for bilateral)
    
    // Check if this is a bilateral exercise on left side - need to switch
    // Skip in partner mode - bilateral state is computed from elapsed time
    if (!(partnerMode.value && isWorkoutPhase.value)) {
      if (isBilateralExercise.value && currentSide.value === 'left') {
        const switchDuration = currentExercise.value.switchRestDuration || 5
        isSwitchingSides.value = true
        timeLeft.value = switchDuration
        if (soundEnabled.value) playChange()
        return
      }

      // Reset bilateral state when exercise completes
      if (isBilateralExercise.value && currentSide.value === 'right') {
        currentSide.value = null
      }
    }

    // Normal exercise end - go to rest or next exercise
    const hasRest = currentExercise.value.restAfter > 0 || 
      (partnerMode.value && isWorkoutPhase.value && partnerExercise.value?.restAfter > 0)
    
    if (hasRest) {
      isResting.value = true
      // In partner mode, use max rest + handoff bonus
      if (partnerMode.value && isWorkoutPhase.value && partnerExercise.value) {
        timeLeft.value = getPartnerModeRestDuration(currentExercise.value, partnerExercise.value)
      } else {
        timeLeft.value = currentExercise.value.restAfter
      }
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
            const firstExercise = currentPhase.value.exercises[0]
            timeLeft.value = initializeExercise(firstExercise)
            if (soundEnabled.value) playChange()
          }
        } else {
          goToNextPhase()
        }
      } else {
        exerciseIndex.value = nextEx
        const nextExercise = currentPhase.value.exercises[nextEx]
        timeLeft.value = initializeExercise(nextExercise)
        if (soundEnabled.value) playChange()
      }
    }
  }

  const goToNextPhase = () => {
    if (!selectedWorkout.value) return

    const nextPhaseIdx = phaseIndex.value + 1

    if (nextPhaseIdx >= selectedWorkout.value.phases.length) {
      isFinished.value = true
      isRunning.value = false
      stopTimer()
      if (soundEnabled.value) playPhaseEnd()
    } else {
      if (soundEnabled.value) playPhaseEnd()
      phaseIndex.value = nextPhaseIdx
      exerciseIndex.value = 0
      round.value = 1
      currentSide.value = null
      isSwitchingSides.value = false
      const firstExercise = selectedWorkout.value.phases[nextPhaseIdx].exercises[0]
      timeLeft.value = initializeExercise(firstExercise)
    }
  }

  const prevStep = () => {
    if (!selectedWorkout.value) return

    // Handle going back during switch rest
    if (isSwitchingSides.value) {
      isSwitchingSides.value = false
      currentSide.value = 'left'
      timeLeft.value = currentExercise.value.perSideDuration
      return
    }

    // Handle going back from right side to switch rest (or left side)
    if (isBilateralExercise.value && currentSide.value === 'right') {
      // Go back to left side
      currentSide.value = 'left'
      timeLeft.value = currentExercise.value.perSideDuration
      return
    }

    if (isRoundRest.value) {
      isRoundRest.value = false
      const lastEx = totalExercises.value - 1
      exerciseIndex.value = lastEx
      const lastExercise = currentPhase.value.exercises[lastEx]
      timeLeft.value = initializeExercise(lastExercise)
      // If bilateral, start at left side
      if (lastExercise.bilateral) {
        currentSide.value = 'left'
      }
      return
    }

    if (isResting.value) {
      isResting.value = false
      // If current exercise is bilateral, go back to right side
      if (isBilateralExercise.value) {
        currentSide.value = 'right'
        timeLeft.value = currentExercise.value.perSideDuration
      } else {
        timeLeft.value = currentExercise.value.duration
      }
      return
    }

    // Currently on left side of bilateral - go to previous exercise
    if (isBilateralExercise.value && currentSide.value === 'left') {
      if (exerciseIndex.value > 0) {
        exerciseIndex.value--
        const prevExercise = currentPhase.value.exercises[exerciseIndex.value]
        if (prevExercise.bilateral) {
          currentSide.value = 'right'
          timeLeft.value = prevExercise.perSideDuration
        } else {
          currentSide.value = null
          timeLeft.value = prevExercise.duration
        }
      } else if (round.value > 1) {
        round.value--
        const lastEx = totalExercises.value - 1
        exerciseIndex.value = lastEx
        const lastExercise = currentPhase.value.exercises[lastEx]
        if (lastExercise.bilateral) {
          currentSide.value = 'right'
          timeLeft.value = lastExercise.perSideDuration
        } else {
          currentSide.value = null
          timeLeft.value = lastExercise.duration
        }
      } else if (phaseIndex.value > 0) {
        const prevPhase = selectedWorkout.value.phases[phaseIndex.value - 1]
        phaseIndex.value--
        round.value = prevPhase.rounds
        const lastEx = prevPhase.exercises.length - 1
        exerciseIndex.value = lastEx
        const lastExercise = prevPhase.exercises[lastEx]
        if (lastExercise.bilateral) {
          currentSide.value = 'right'
          timeLeft.value = lastExercise.perSideDuration
        } else {
          currentSide.value = null
          timeLeft.value = lastExercise.duration
        }
      }
      return
    }

    // Normal prevStep for non-bilateral
    if (exerciseIndex.value > 0) {
      exerciseIndex.value--
      const prevExercise = currentPhase.value.exercises[exerciseIndex.value]
      if (prevExercise.bilateral) {
        currentSide.value = 'right'
        timeLeft.value = prevExercise.perSideDuration
      } else {
        currentSide.value = null
        timeLeft.value = prevExercise.duration
      }
    } else if (round.value > 1) {
      round.value--
      const lastEx = totalExercises.value - 1
      exerciseIndex.value = lastEx
      const lastExercise = currentPhase.value.exercises[lastEx]
      if (lastExercise.bilateral) {
        currentSide.value = 'right'
        timeLeft.value = lastExercise.perSideDuration
      } else {
        currentSide.value = null
        timeLeft.value = lastExercise.duration
      }
    } else if (phaseIndex.value > 0) {
      const prevPhase = selectedWorkout.value.phases[phaseIndex.value - 1]
      phaseIndex.value--
      round.value = prevPhase.rounds
      const lastEx = prevPhase.exercises.length - 1
      exerciseIndex.value = lastEx
      const lastExercise = prevPhase.exercises[lastEx]
      if (lastExercise.bilateral) {
        currentSide.value = 'right'
        timeLeft.value = lastExercise.perSideDuration
      } else {
        currentSide.value = null
        timeLeft.value = lastExercise.duration
      }
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

  // Selection Methods
  const selectWorkout = (workoutId) => {
    selectedWorkoutId.value = workoutId
  }

  const goToSelection = () => {
    stopTimer()
    selectedWorkoutId.value = null
    resetWorkoutState()
  }

  const goToOverview = () => {
    stopTimer()
    isRunning.value = false
    isStarted.value = false
  }

  const resetWorkoutState = () => {
    phaseIndex.value = 0
    exerciseIndex.value = 0
    round.value = 1
    timeLeft.value = 0
    isResting.value = false
    isRoundRest.value = false
    isRunning.value = false
    isStarted.value = false
    isFinished.value = false
    currentSide.value = null
    isSwitchingSides.value = false
  }

  const start = () => {
    if (!selectedWorkout.value) return
    initAudio()
    const firstPhase = selectedWorkout.value.phases[0]
    const firstExercise = firstPhase.exercises[0]
    // For workout phase with partner mode, consider partner's exercise duration
    if (partnerMode.value && firstPhase.type === 'workout') {
      const partnerEx = firstPhase.exercises[1 % firstPhase.exercises.length]
      timeLeft.value = initializeExerciseWithPartnerMode(firstExercise, partnerEx)
    } else {
      timeLeft.value = initializeExercise(firstExercise)
    }
    isStarted.value = true
    isRunning.value = true
    if (soundEnabled.value) playStart()
  }

  const setPartnerMode = (enabled) => {
    partnerMode.value = enabled
  }

  const togglePartnerMode = () => {
    partnerMode.value = !partnerMode.value
  }

  const startFromPhase = (targetPhaseIndex) => {
    if (!selectedWorkout.value) return
    if (targetPhaseIndex < 0 || targetPhaseIndex >= selectedWorkout.value.phases.length) return

    initAudio()
    phaseIndex.value = targetPhaseIndex
    exerciseIndex.value = 0
    round.value = 1
    const targetPhase = selectedWorkout.value.phases[targetPhaseIndex]
    const firstExercise = targetPhase.exercises[0]
    // For workout phase with partner mode, consider partner's exercise duration
    if (partnerMode.value && targetPhase.type === 'workout') {
      const partnerEx = targetPhase.exercises[1 % targetPhase.exercises.length]
      timeLeft.value = initializeExerciseWithPartnerMode(firstExercise, partnerEx)
    } else {
      timeLeft.value = initializeExercise(firstExercise)
    }
    isResting.value = false
    isRoundRest.value = false
    isSwitchingSides.value = false
    isStarted.value = true
    isRunning.value = true
    isFinished.value = false
    if (soundEnabled.value) playStart()
  }

  const goToPhase = (targetPhaseIndex) => {
    if (!selectedWorkout.value) return
    if (targetPhaseIndex < 0 || targetPhaseIndex >= selectedWorkout.value.phases.length) return
    if (targetPhaseIndex === phaseIndex.value) return

    phaseIndex.value = targetPhaseIndex
    exerciseIndex.value = 0
    round.value = 1
    const targetPhase = selectedWorkout.value.phases[targetPhaseIndex]
    const firstExercise = targetPhase.exercises[0]
    // For workout phase with partner mode, consider partner's exercise duration
    if (partnerMode.value && targetPhase.type === 'workout') {
      const partnerEx = targetPhase.exercises[1 % targetPhase.exercises.length]
      timeLeft.value = initializeExerciseWithPartnerMode(firstExercise, partnerEx)
    } else {
      timeLeft.value = initializeExercise(firstExercise)
    }
    isResting.value = false
    isRoundRest.value = false
    isSwitchingSides.value = false
    isFinished.value = false
    if (soundEnabled.value) playChange()
  }

  const restart = () => {
    stopTimer()
    resetWorkoutState()
    if (selectedWorkout.value) {
      const firstExercise = selectedWorkout.value.phases[0].exercises[0]
      timeLeft.value = initializeExercise(firstExercise)
    }
  }

  const toggleSound = () => {
    soundEnabled.value = !soundEnabled.value
  }

  // Watch running state
  watch(isRunning, async (running) => {
    if (running && !isFinished.value) {
      startTimer()
      await requestWakeLock()
    } else {
      stopTimer()
      await releaseWakeLock()
    }
  })

  // Re-acquire wake lock when page becomes visible (if workout is running)
  const handleVisibilityChange = async () => {
    if (document.visibilityState === 'visible' && isRunning.value && !isFinished.value) {
      await requestWakeLock()
    }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  // Cleanup
  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    stopTimer()
  })

  return {
    // Workouts List
    workouts: workoutsList,

    // Selection State
    selectedWorkoutId,
    selectedWorkout,

    // Workout State
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

    // Bilateral State
    currentSide,
    isSwitchingSides,
    isBilateralExercise,

    // Partner Mode State
    partnerMode,
    isWorkoutPhase,
    partnerExercise,
    partnerExerciseIndex,
    partnerNextExercise,
    partnerNextExerciseIndex,
    partnerFinishedEarly,
    personAFinishedEarly,
    personABilateralState,
    personBBilateralState,
    partnerModeElapsed,
    partnerModeMaxDuration,

    // Computed
    currentPhase,
    currentExercise,
    totalExercises,
    totalRounds,
    progress,
    nextInfo,

    // Methods
    formatTime,
    getEffectiveDuration,
    nextStep,
    prevStep,
    toggleRunning,
    start,
    restart,
    toggleSound,
    setPartnerMode,
    togglePartnerMode,

    // Navigation Methods
    selectWorkout,
    goToSelection,
    goToOverview,
    startFromPhase,
    goToPhase,

    // Wake Lock
    wakeLockSupported,
    wakeLockActive
  }
}
