import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

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
