import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n'
import { initObservability } from './lib/observability'
import { cleanupStaleAudioCaches } from './utils/staleCacheCleanup'
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
  let refreshingForUpdate = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshingForUpdate) {
      refreshingForUpdate = true
      window.location.reload()
    }
  })
  navigator.serviceWorker.ready.then(registration => registration.update()).catch(() => undefined)
}
