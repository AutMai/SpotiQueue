import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from './components/theme-provider'
import './index.css'
import App from './App'
import Display from './components/Display'

const root = ReactDOM.createRoot(document.getElementById('root'))

function isDisplayRoute() {
  if (typeof window === 'undefined') return false
  const path = window.location.pathname.replace(/\/$/, '')
  return path.endsWith('/display')
}

function Root() {
  const isDisplay = isDisplayRoute()
  return isDisplay ? <Display /> : (
    <ThemeProvider defaultTheme="system" storageKey="spotiqueue-theme">
      <App />
    </ThemeProvider>
  )
}

root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
