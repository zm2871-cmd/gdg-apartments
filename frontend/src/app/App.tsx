import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { Skeleton } from '../components/ui'
import { HomePage } from '../pages/HomePage'
import { WorkspaceProvider } from './workspace'
import type { createServices } from '../services/runtime'

const BuildingReport = lazy(() => import('../pages/BuildingReportPage'))
const Search = lazy(() => import('../pages/SearchPage'))
const Compare = lazy(() => import('../pages/ComparePage'))
const Saved = lazy(() => import('../pages/SavedPage'))
const Account = lazy(() => import('../pages/AccountPage'))
const Info = lazy(() => import('../pages/HowItWorksPage'))
const NotFound = lazy(() => import('../pages/NotFoundPage'))

const loading = (label: string, variant: Parameters<typeof Skeleton>[0]['variant']) => (
  <div className="container page"><Skeleton label={label} variant={variant} /></div>
)

export default function App({ services }: { services: ReturnType<typeof createServices> }) {
  return <WorkspaceProvider services={services}><BrowserRouter><Routes>
    <Route element={<Layout />}>
      <Route index element={<HomePage />} />
      <Route path="search" element={<Suspense fallback={loading('Loading search', 'rows')}><Search /></Suspense>} />
      <Route path="building/:buildingId" element={<Suspense fallback={loading('Loading building report', 'report')}><BuildingReport /></Suspense>} />
      <Route path="compare" element={<Suspense fallback={loading('Loading comparison', 'compare')}><Compare /></Suspense>} />
      <Route path="saved" element={<Suspense fallback={loading('Loading saved properties', 'rows')}><Saved /></Suspense>} />
      <Route path="account" element={<Suspense fallback={loading('Loading account', 'rows')}><Account /></Suspense>} />
      <Route path="how-it-works" element={<Suspense fallback={loading('Loading methodology', 'rows')}><Info /></Suspense>} />
      <Route path="*" element={<Suspense fallback={loading('Loading page', 'rows')}><NotFound /></Suspense>} />
    </Route>
  </Routes></BrowserRouter></WorkspaceProvider>
}
