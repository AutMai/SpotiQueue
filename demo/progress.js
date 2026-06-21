import { loadStore, saveStore } from './store.js'

let intervalId = null

export function startDemoProgress() {
  if (intervalId || typeof window === 'undefined') return

  intervalId = setInterval(() => {
    const state = loadStore()
    if (!state.currentlyPlaying) return

    const elapsed = Date.now() - (state.playingStartedAt || Date.now())
    const duration = state.currentlyPlaying.duration_ms || 200000
    const progress = Math.min(elapsed, duration)

    if (progress >= duration && state.queue.length > 0) {
      const next = state.queue.shift()
      state.currentlyPlaying = { ...next, progress_ms: 0 }
      state.playingStartedAt = Date.now()
    } else {
      state.currentlyPlaying = {
        ...state.currentlyPlaying,
        progress_ms: progress
      }
    }
    saveStore()
  }, 1000)
}

export function getNowPlayingTrack(state) {
  if (!state.currentlyPlaying) return null
  const elapsed = Date.now() - (state.playingStartedAt || Date.now())
  const duration = state.currentlyPlaying.duration_ms || 200000
  const progress_ms = Math.min(elapsed, duration)
  return {
    ...state.currentlyPlaying,
    progress_ms,
    lyrics: {
      lines: [
        { startTimeMs: 0, words: 'Demo mode: lyrics are simulated' },
        { startTimeMs: 5000, words: 'Queue songs and vote on tracks' },
        { startTimeMs: 12000, words: 'Try the display mode on desktop' },
        { startTimeMs: 20000, words: 'All data stays in your browser' }
      ]
    }
  }
}
