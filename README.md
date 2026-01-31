# 🏋️ Workout Timer

A clean, minimal workout timer app designed for tablet displays. Shows one exercise at a time with automatic transitions, countdown timers, and audio feedback.

## ✨ Features

- **Phase-based workouts**: Warmup → Main Circuit → Cooldown
- **Auto-progression**: Automatic transition between exercises
- **Visual countdown**: Large, readable timer with color changes
- **Audio feedback**:
  - Countdown beeps (3, 2, 1)
  - Exercise change sound
  - Phase completion sound
- **Controls**: Play/Pause, Previous, Next
- **Progress tracking**: Round and exercise indicators
- **Responsive design**: Optimized for tablet displays
- **Color-coded phases**: Orange (warmup), Green (workout), Purple (cooldown), Blue (rest)
- **Bilateral exercises**: Automatic left/right side switching with countdown
- **Wake Lock**: Keeps screen on during workout sessions
- **Partner Mode**: Two people workout together sharing equipment

## 👥 Partner Mode

Allows two people to workout simultaneously while sharing equipment:

- **Split screen**: Person A (cyan) and Person B (pink) each see their current exercise
- **Alternating exercises**: Person A does exercise N, Person B does exercise N+1
- **Synchronized timer**: Uses the longest exercise duration for both
- **Rest bonus**: +5 seconds added to rest periods for equipment handoff
- **Independent bilateral tracking**: Each person tracks their own left/right sides

Enable Partner Mode from the workout overview screen before starting.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/workout-timer.git
cd workout-timer

# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173` in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

## 📁 Project Structure

```
src/
├── App.vue                     # Root component
├── main.js                     # App entry point
├── style.css                   # Tailwind imports
├── components/
│   └── WorkoutTimer.vue        # Main timer UI component
├── composables/
│   ├── useAudio.js             # Audio/beep functionality
│   ├── useWakeLock.js          # Screen wake lock management
│   └── useWorkout.js           # Timer logic & state management
└── data/
    └── workouts.json           # Workout routines definitions
```

## 🏗️ Architecture

| File | Responsibility |
|------|----------------|
| `useAudio.js` | Web Audio API composable for sounds |
| `useWakeLock.js` | Screen Wake Lock API to prevent sleep |
| `useWorkout.js` | Timer state, navigation, and workout logic |
| `WorkoutTimer.vue` | Presentation layer (UI only) |
| `workouts.json` | Workout data (decoupled from logic) |

## 📝 Customizing Workouts

Edit `src/data/workouts.json` to create your own routines:

```json
{
  "name": "My Workout",
  "phases": [
    {
      "type": "warmup",
      "name": "Warm Up",
      "icon": "🔥",
      "rounds": 1,
      "exercises": [
        {
          "name": "Jumping Jacks",
          "duration": 60,
          "restAfter": 15,
          "instructions": [
            "Jump while spreading arms and legs",
            "Keep a steady rhythm"
          ],
          "tip": "Optional tip for the exercise"
        }
      ]
    },
    {
      "type": "workout",
      "name": "Main Circuit",
      "icon": "⚡",
      "rounds": 4,
      "restBetweenRounds": 60,
      "exercises": [...]
    },
    {
      "type": "cooldown",
      "name": "Stretching",
      "icon": "🧘",
      "rounds": 1,
      "exercises": [...]
    }
  ]
}
```

### Phase Types

| Type | Color | Use Case |
|------|-------|----------|
| `warmup` | Orange | Pre-workout activation |
| `workout` | Green | Main exercise circuit |
| `cooldown` | Purple | Post-workout stretching |

### Exercise Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | ✅ | Exercise name |
| `duration` | number | ✅ | Duration in seconds |
| `restAfter` | number | ✅ | Rest time after exercise (0 for none) |
| `instructions` | string[] | ✅ | Step-by-step instructions |
| `tip` | string | ❌ | Optional helpful tip |
| `bilateral` | boolean | ❌ | Enable left/right side switching |
| `perSideDuration` | number | ❌ | Duration per side (requires `bilateral: true`) |
| `switchRestDuration` | number | ❌ | Rest between sides (default: 5s) |

### Bilateral Exercise Example

```json
{
  "name": "Side Plank",
  "restAfter": 30,
  "bilateral": true,
  "perSideDuration": 30,
  "switchRestDuration": 5,
  "instructions": [
    "Support on one forearm",
    "Keep body in straight line"
  ]
}
```

## 🛠️ Tech Stack

- **Vue 3** - Composition API with `<script setup>`
- **Vite** - Build tool
- **Tailwind CSS v4** - Styling
- **Lucide Vue** - Icons
- **Web Audio API** - Sound effects
- **Screen Wake Lock API** - Prevents screen sleep

## 📱 Usage Tips

- **Tablet mode**: Works best on tablets in landscape orientation
- **Sound**: Tap anywhere on the screen first to enable audio (browser requirement)
- **Pause**: Use the pause button to take a longer break
- **Skip**: Use Previous/Next buttons to navigate manually
- **Partner Mode**: Enable before starting for two-person workouts

## 🔮 Future Improvements

- [ ] Video demonstrations for exercises
- [x] Multiple workout routines
- [x] Bilateral exercise support
- [x] Partner mode for shared equipment
- [ ] Workout history and statistics
- [ ] Custom workout builder
- [ ] Voice announcements
- [ ] PWA support for offline use

## 📄 License

MIT License - feel free to use and modify for your own projects.
