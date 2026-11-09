import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n'
import { initObservability } from './lib/observability'
import { cleanupStaleAudioCaches } from './utils/staleCacheCleanup'
import { createUpdateGate } from './lib/swUpdateGate'
import { usePlayerStore } from './store/playerStore'
import './index.css'

initObservability()
// Delete retired demo-audio caches before the first playback so a stale opaque
// response can never be reused by the CORS-mode <audio> element.
void cleanupStaleAudioCaches()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  // A deploy takes over the open tab immediately (skipWaiting + clientsClaim). Reloading at that
  // instant would stop whatever is playing and sign the user out of YouTube, whose token is
  // memory-only - so the reload waits for the player to be idle. See swUpdateGate.ts.
  const updateGate = createUpdateGate({
    getState: () => {
      const state = usePlayerStore.getState()
      return { isPlaying: state.isPlaying, playbackState: state.playbackState }
    },
    subscribe: listener => usePlayerStore.subscribe(listener),
    reload: () => window.location.reload(),
  })
  navigator.serviceWorker.addEventListener('controllerchange', () => updateGate.markPending())
  navigator.serviceWorker.ready.then(registration => registration.update()).catch(() => undefined)
}
