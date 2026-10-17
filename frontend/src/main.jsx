import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { capitalizeFormInput } from './utils/capitalizeFormText'

// Run before React's delegated onChange so displayed and saved text agree.
document.addEventListener('input', capitalizeFormInput, true)
document.addEventListener('compositionend', event => {
  capitalizeFormInput(event)
  event.target.dispatchEvent(new Event('input', { bubbles: true }))
}, true)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
