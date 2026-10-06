import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/eds-tokens.css'
import './index.css'
import App from './App.jsx'

// EDS themes are class-driven (.eds-light / .eds-dark); follow the OS preference.
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => {
  document.documentElement.classList.toggle('eds-dark', darkQuery.matches)
  document.documentElement.classList.toggle('eds-light', !darkQuery.matches)
}
applyTheme()
darkQuery.addEventListener('change', applyTheme)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
