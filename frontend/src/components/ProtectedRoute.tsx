import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { loginDestination } from '../app/authNavigation'
import { useWorkspace } from '../app/workspace'
import { Skeleton } from './ui'

export function ProtectedRoute({ children, cloudOnly = false }: { children: ReactNode; cloudOnly?: boolean }) {
  const { user, loading } = useAuth()
  const { housing } = useWorkspace()
  const location = useLocation()
  if (cloudOnly && housing.mode === 'mock') return children
  if (loading) return <div className="container page narrow-page"><Skeleton label="Checking your account" variant="rows" count={1} /></div>
  if (!user) return <Navigate to={loginDestination(location.pathname + location.search)} replace />
  return children
}
