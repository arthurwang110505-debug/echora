import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n'
import { initObservability } from './lib/observability'
import { cleanupStaleAudioCaches } from './utils/staleCacheCleanup'
import { createUpdateGate } from './lib/swUpdateGate'
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
  //
  // The store is read through a cached dynamic import rather than a static one: `main.tsx` sits
  // inside the app-shell budget, and importing `playerStore` statically pulls the whole playback
  // store into the entry chunk for a listener that only needs two fields. By the time a deploy
  // lands the store is already loaded, so the import resolves from cache.
  type PlayerStore = typeof import('./store/playerStore')['usePlayerStore']
  let storePromise: Promise<PlayerStore> | null = null
  const loadStore = () => (storePromise ??= import('./store/playerStore').then(m => m.usePlayerStore))

  // Until the store is available nothing is playing, which is the state that says "safe to
  // reload" - and by the time a controllerchange fires, the app has long since mounted.
  let liveStore: PlayerStore | null = null
  void loadStore().then(store => { liveStore = store })

  const updateGate = createUpdateGate({
    getState: () => {
      const state = liveStore?.getState()
      return { isPlaying: state?.isPlaying ?? false, playbackState: state?.playbackState ?? 'paused' }
    },
    subscribe: listener => {
      let unsubscribe: (() => void) | undefined
      void loadStore().then(store => { unsubscribe = store.subscribe(listener) })
      return () => unsubscribe?.()
    },
    reload: () => window.location.reload(),
  })
  navigator.serviceWorker.addEventListener('controllerchange', () => updateGate.markPending())
  navigator.serviceWorker.ready.then(registration => registration.update()).catch(() => undefined)
}
