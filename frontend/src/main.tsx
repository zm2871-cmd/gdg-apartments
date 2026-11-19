import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { createServices } from './services/runtime'
import { ErrorPanel } from './components/ui'
import '@fontsource-variable/inter/wght.css'
import './styles/base.css'
import './styles/report.css'
import './styles/pages.css'

const root = createRoot(document.getElementById('root')!)
try {
  const services = createServices({
    VITE_DATA_PROVIDER: import.meta.env.VITE_DATA_PROVIDER,
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  }, localStorage)
  root.render(<StrictMode><App services={services} /></StrictMode>)
} catch (error) {
  root.render(<main className="container page"><ErrorPanel message={error instanceof Error ? error.message : 'Could not start Hearthstone Hub.'} /></main>)
}
