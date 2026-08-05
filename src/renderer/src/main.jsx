import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppProvider } from './context/AppContext'
import { bootstrapThemeFromStorage } from './utils/bootstrapTheme'
import './index.css'

bootstrapThemeFromStorage()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>
)
