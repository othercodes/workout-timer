<script setup>
import { computed } from 'vue'
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, ChevronRight, ArrowLeft } from 'lucide-vue-next'
import { useWorkout } from '@/composables/useWorkout'
import workoutsData from '@/data/workouts.json'

const {
  workouts, selectedWorkout, selectWorkout, goToSelection, goToOverview,
  phaseIndex, exerciseIndex, round, timeLeft,
  isResting, isRoundRest, isRunning, isStarted, isFinished, soundEnabled,
  currentPhase, currentExercise, totalExercises, totalRounds, progress, nextInfo,
  formatTime, getEffectiveDuration, nextStep, prevStep, toggleRunning, start, restart, toggleSound,
  startFromPhase, goToPhase,
  // Bilateral state
  currentSide, isSwitchingSides, isBilateralExercise
} = useWorkout(workoutsData.workouts)

const phaseColors = {
  warmup: {
    bg: 'from-orange-900 via-slate-800 to-orange-900',
    accent: 'text-orange-400',
    btn: 'bg-orange-500 hover:bg-orange-400',
    badge: 'bg-orange-500/20 text-orange-300'
  },
  workout: {
    bg: 'from-emerald-900 via-slate-800 to-emerald-900',
    accent: 'text-emerald-400',
    btn: 'bg-emerald-500 hover:bg-emerald-400',
    badge: 'bg-emerald-500/20 text-emerald-300'
  },
  cooldown: {
    bg: 'from-violet-900 via-slate-800 to-violet-900',
    accent: 'text-violet-400',
    btn: 'bg-violet-500 hover:bg-violet-400',
    badge: 'bg-violet-500/20 text-violet-300'
  },
  rest: {
    bg: 'from-blue-900 via-slate-800 to-blue-900',
    accent: 'text-blue-300',
    btn: 'bg-blue-500 hover:bg-blue-400',
    badge: 'bg-blue-500/20 text-blue-300'
  },
  switch: {
    bg: 'from-amber-900 via-slate-800 to-amber-900',
    accent: 'text-amber-300',
    btn: 'bg-amber-500 hover:bg-amber-400',
    badge: 'bg-amber-500/20 text-amber-300'
  }
}

const colors = computed(() => {
  if (isSwitchingSides.value) return phaseColors.switch
  if (isResting.value || isRoundRest.value) return phaseColors.rest
  return phaseColors[currentPhase.value?.type] || phaseColors.workout
})

const timerClass = computed(() => {
  if (timeLeft.value <= 3) return 'text-red-400 animate-pulse'
  return colors.value.accent
})

const statusText = computed(() => {
  if (isSwitchingSides.value) return '🔄 CAMBIO DE LADO'
  if (isRoundRest.value) return '⏸️ DESCANSO ENTRE RONDAS'
  if (isResting.value) return '💤 DESCANSO'
  return '💪 EJERCICIO'
})

const sideIndicator = computed(() => {
  if (!currentSide.value) return null
  if (currentSide.value === 'left') return { icon: '⬅️', text: 'IZQUIERDA / LEFT' }
  if (currentSide.value === 'right') return { icon: '➡️', text: 'DERECHA / RIGHT' }
  return null
})

const titleText = computed(() => {
  if (isSwitchingSides.value) return 'Prepara el otro lado'
  if (isRoundRest.value) return 'Prepara siguiente ronda'
  if (isResting.value) return 'Recupera'
  return currentExercise.value?.name
})

const getWorkoutDuration = (workout) => {
  let total = 0
  for (const phase of workout.phases) {
    const rounds = phase.rounds || 1
    const exerciseTime = phase.exercises.reduce((sum, ex) => sum + getEffectiveDuration(ex) + (ex.restAfter || 0), 0)
    const roundRestTime = (phase.restBetweenRounds || 0) * (rounds - 1)
    total += (exerciseTime * rounds) + roundRestTime
  }
  return total
}

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60)
  return `${mins} min`
}
</script>

<template>
  <!-- Selection Screen -->
  <div
    v-if="!selectedWorkout"
    class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col p-6 text-white"
  >
    <div class="max-w-4xl w-full mx-auto">
      <h1 class="text-3xl md:text-4xl font-bold mb-2 text-center text-emerald-400">
        Mis Entrenamientos
      </h1>
      <p class="text-slate-400 text-center mb-8">
        Selecciona un entrenamiento para comenzar
      </p>

      <div class="grid gap-4 md:grid-cols-2">
        <button
          v-for="workout in workouts"
          :key="workout.id"
          @click="selectWorkout(workout.id)"
          class="bg-slate-800/50 hover:bg-slate-700/50 rounded-2xl p-6 text-left transition-all hover:scale-[1.02] border border-slate-700/50 hover:border-emerald-500/50"
        >
          <div class="flex items-start justify-between mb-3">
            <h2 class="text-xl font-bold text-white">
              {{ workout.name }}
            </h2>
            <span class="text-sm text-slate-400 bg-slate-700/50 px-3 py-1 rounded-full">
              {{ formatDuration(getWorkoutDuration(workout)) }}
            </span>
          </div>

          <p class="text-slate-400 text-sm mb-4">
            {{ workout.description }}
          </p>

          <div class="flex gap-2 flex-wrap">
            <span
              v-for="phase in workout.phases"
              :key="phase.type"
              :class="['text-xs px-3 py-1 rounded-full', phaseColors[phase.type].badge]"
            >
              {{ phase.icon }} {{ phase.name }}
            </span>
          </div>
        </button>
      </div>
    </div>
  </div>

  <!-- Overview Screen -->
  <div
    v-else-if="!isStarted"
    class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col p-6 text-white"
  >
    <!-- Back Button -->
    <button
      @click="goToSelection"
      class="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors self-start"
    >
      <ArrowLeft :size="20" />
      <span>Volver a entrenamientos</span>
    </button>

    <div class="text-center max-w-3xl w-full mx-auto">
      <h1 class="text-3xl md:text-5xl font-bold mb-6 text-emerald-400">
        {{ selectedWorkout.name }}
      </h1>

      <div class="space-y-4 mb-8">
        <div
          v-for="(phase, i) in selectedWorkout.phases"
          :key="i"
          class="bg-slate-800/50 rounded-xl p-4 transition-all hover:bg-slate-700/50 border border-transparent hover:border-slate-600/50 cursor-pointer group"
          @click="startFromPhase(i)"
        >
          <div class="flex items-center gap-3 mb-3">
            <span class="text-2xl">{{ phase.icon }}</span>
            <h2 :class="['text-xl font-semibold', phaseColors[phase.type].accent]">
              {{ phase.name }}
            </h2>
            <span v-if="phase.rounds > 1" class="text-slate-400 text-sm">
              × {{ phase.rounds }} rondas
            </span>
            <div class="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
              <Play :size="20" :class="phaseColors[phase.type].accent" fill="currentColor" />
            </div>
          </div>

          <div class="grid gap-1 text-sm text-slate-300">
            <div
              v-for="(ex, j) in phase.exercises"
              :key="j"
              class="flex justify-between py-1 px-3 bg-slate-700/30 rounded"
            >
              <span class="flex items-center gap-2">
                {{ ex.name }}
                <span v-if="ex.bilateral" class="text-xs text-amber-400">⇄</span>
              </span>
              <span :class="phaseColors[phase.type].accent">
                {{ formatTime(getEffectiveDuration(ex)) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <button
        @click="start"
        class="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold text-xl px-12 py-4 rounded-full transition-all transform hover:scale-105 flex items-center gap-3 mx-auto"
      >
        <Play :size="28" fill="currentColor" />
        Comenzar
      </button>
    </div>
  </div>

  <!-- Finished Screen -->
  <div
    v-else-if="isFinished"
    class="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900 flex flex-col items-center justify-center p-8 text-white"
  >
    <div class="text-center">
      <div class="text-7xl mb-6">🎉</div>
      <h1 class="text-4xl md:text-5xl font-bold mb-4 text-emerald-400">
        ¡Completado!
      </h1>
      <p class="text-xl text-slate-300 mb-8">
        Has terminado todo el entrenamiento
      </p>
      <div class="flex flex-col gap-4">
        <button
          @click="restart"
          class="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold text-xl px-12 py-4 rounded-full"
        >
          Repetir entrenamiento
        </button>
        <button
          @click="goToSelection"
          class="text-slate-400 hover:text-white transition-colors"
        >
          Volver a entrenamientos
        </button>
      </div>
    </div>
  </div>

  <!-- Workout Screen -->
  <div
    v-else
    :class="['min-h-screen flex flex-col transition-colors duration-500 bg-gradient-to-br', colors.bg]"
  >
    <!-- Header -->
    <div class="flex justify-between items-center p-4 text-white">
      <div class="flex items-center gap-3">
        <button
          @click="goToOverview"
          class="p-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft :size="24" />
        </button>
        <span class="text-2xl">{{ currentPhase.icon }}</span>
        <span :class="['font-semibold', colors.accent]">{{ currentPhase.name }}</span>
      </div>

      <div class="text-sm">
        <template v-if="totalRounds > 1">
          <span class="text-slate-400">Ronda </span>
          <span :class="['font-bold', colors.accent]">{{ round }}/{{ totalRounds }}</span>
          <span class="mx-2 text-slate-600">|</span>
        </template>
        <span class="text-slate-400">Ejercicio </span>
        <span :class="['font-bold', colors.accent]">
          {{ exerciseIndex + 1 }}/{{ totalExercises }}
        </span>
      </div>

      <button @click="toggleSound" class="p-2 text-slate-400 hover:text-white">
        <Volume2 v-if="soundEnabled" :size="24" />
        <VolumeX v-else :size="24" />
      </button>
    </div>

    <!-- Phase Navigation Bar -->
    <div class="flex justify-center items-center gap-2 px-4 py-2 bg-slate-900/30">
      <button
        v-for="(phase, i) in selectedWorkout.phases"
        :key="i"
        @click="goToPhase(i)"
        :class="[
          'flex items-center gap-2 px-3 py-1.5 rounded-full transition-all text-sm',
          i === phaseIndex
            ? [phaseColors[phase.type].btn, 'text-slate-900 font-semibold']
            : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-white'
        ]"
      >
        <span>{{ phase.icon }}</span>
        <span class="hidden sm:inline">{{ phase.name }}</span>
      </button>
    </div>

    <!-- Progress Bar -->
    <div class="h-1 bg-slate-700">
      <div
        :class="['h-full transition-all duration-300', colors.btn.split(' ')[0]]"
        :style="{ width: `${progress}%` }"
      />
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col items-center justify-center p-6 text-white">
      <!-- Status Badge -->
      <div :class="['text-lg font-semibold mb-2 px-6 py-2 rounded-full', colors.badge]">
        {{ statusText }}
      </div>

      <!-- Side Indicator (for bilateral exercises) -->
      <div
        v-if="sideIndicator && !isSwitchingSides"
        class="flex items-center gap-3 mb-4 px-6 py-3 rounded-full bg-slate-800/70 border-2 border-amber-500/50"
      >
        <span class="text-3xl">{{ sideIndicator.icon }}</span>
        <span class="text-xl font-bold text-amber-300">{{ sideIndicator.text }}</span>
      </div>

      <!-- Exercise Name -->
      <h1 class="text-3xl md:text-5xl lg:text-6xl font-bold text-center mb-6 px-4">
        {{ titleText }}
      </h1>

      <!-- Timer -->
      <div :class="['text-8xl md:text-9xl font-mono font-bold mb-8 transition-colors', timerClass]">
        {{ formatTime(timeLeft) }}
      </div>

      <!-- Instructions -->
      <div
        v-if="!isResting && !isRoundRest && !isSwitchingSides && currentExercise"
        class="max-w-xl w-full bg-slate-800/50 rounded-2xl p-6 mb-6"
      >
        <ul class="space-y-2 text-slate-200 text-lg">
          <li
            v-for="(instruction, i) in currentExercise.instructions"
            :key="i"
            class="flex items-start gap-3"
          >
            <span :class="colors.accent">•</span>
            <span>{{ instruction }}</span>
          </li>
        </ul>

        <div
          v-if="currentExercise.tip"
          class="mt-4 pt-4 border-t border-slate-700 text-amber-300 flex items-start gap-2"
        >
          <span>💡</span>
          <span>{{ currentExercise.tip }}</span>
        </div>
      </div>

      <!-- Next Info (during rest or switch) -->
      <div
        v-if="nextInfo && (isResting || isRoundRest || isSwitchingSides)"
        class="text-center text-slate-300 flex items-center gap-2"
      >
        <ChevronRight :size="20" class="text-slate-500" />
        <span class="text-sm uppercase tracking-wide">{{ nextInfo.label }}:</span>
        <span class="text-xl font-semibold text-white">{{ nextInfo.name }}</span>
      </div>
    </div>

    <!-- Controls -->
    <div class="flex justify-center items-center gap-6 p-6 pb-8">
      <button
        @click="prevStep"
        class="p-4 bg-slate-700 hover:bg-slate-600 rounded-full text-white transition-colors"
      >
        <SkipBack :size="28" />
      </button>

      <button
        @click="toggleRunning"
        :class="[
          'p-6 rounded-full transition-all transform hover:scale-105 text-slate-900',
          isRunning ? 'bg-amber-500 hover:bg-amber-400' : colors.btn
        ]"
      >
        <Pause v-if="isRunning" :size="36" />
        <Play v-else :size="36" fill="currentColor" />
      </button>

      <button
        @click="nextStep"
        class="p-4 bg-slate-700 hover:bg-slate-600 rounded-full text-white transition-colors"
      >
        <SkipForward :size="28" />
      </button>
    </div>
  </div>
</template>
