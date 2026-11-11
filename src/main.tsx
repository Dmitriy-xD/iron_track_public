import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import '@fontsource/unbounded/latin-600.css'
import '@fontsource/unbounded/latin-700.css'
import '@fontsource/unbounded/latin-800.css'
import '@fontsource/unbounded/cyrillic-600.css'
import '@fontsource/unbounded/cyrillic-700.css'
import '@fontsource/unbounded/cyrillic-800.css'
import './styles.css'
import { watchTheme } from './theme'

watchTheme()

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
