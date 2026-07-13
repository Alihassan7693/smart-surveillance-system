import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { removeWhiteBackground } from './utils/imageUtils.js'

// Set favicon with transparent background
async function initFavicon() {
  try {
    const faviconDataUrl = await removeWhiteBackground('/LOGO.png', 190)
    const link = document.querySelector('link[rel="icon"]') || document.createElement('link')
    link.rel = 'icon'
    link.type = 'image/png'
    link.href = faviconDataUrl
    if (!document.querySelector('link[rel="icon"]')) {
      document.head.appendChild(link)
    }
  } catch (err) {
    console.warn('Failed to set favicon:', err)
  }
}

initFavicon()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
