import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { installErrorReporting } from './lib/errors'
import { applyTheme, watchSystemTheme } from './lib/theme'

applyTheme(); watchSystemTheme(); installErrorReporting()
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
