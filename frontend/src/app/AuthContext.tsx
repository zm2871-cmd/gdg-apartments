import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Session, User } from '@supabase/supabase-js'
import type { AuthAdapter } from '../services/contracts'

type AuthContextValue = {
  auth: AuthAdapter
  user: User | null
  session: Session | null
  loading: boolean
  error: string
  signOut: () => Promise<void>
  finishCallback: (url: URL) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ auth, children }: { auth: AuthAdapter; children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const logoutDestination = useRef<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(auth.available)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  const initial = useRef<Promise<Session | null> | null>(null)

  useEffect(() => {
    // Keep protected routes waiting until the router commits the sign-out destination.
    if (logoutDestination.current === location.pathname + location.search) {
      logoutDestination.current = null
      setSigningOut(false)
    }
  }, [location.key, location.pathname, location.search])

  useEffect(() => {
    if (!auth.available) return
    let active = true
    let receivedEvent = false
    const unsubscribe = auth.onAuthStateChange((_event, current) => {
      if (!active) return
      receivedEvent = true
      setSession(current)
      setError('')
      setLoading(false)
    })
    initial.current ??= auth.getSession()
    initial.current.then(current => {
      if (active && !receivedEvent) setSession(current)
    }).catch(() => {
      if (active && !receivedEvent) setError('Your session could not be restored. Try signing in again.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false; unsubscribe() }
  }, [auth])

  async function signOut() {
    setSigningOut(true)
    try {
      await auth.signOut()
      setSession(null)
      setError('')
      logoutDestination.current = '/'
      navigate('/', { replace: true })
    } catch (error) {
      let current: Session | null
      try {
        current = await auth.getSession()
      } catch {
        setSigningOut(false)
        throw error
      }
      setSession(current)
      if (current) {
        setSigningOut(false)
        throw error
      }
      logoutDestination.current = '/login?error=signout'
      navigate(logoutDestination.current, {
        replace: true,
        state: { authError: 'You’re signed out on this device. Supabase could not confirm sign-out for your other sessions.' },
      })
    }
  }

  async function finishCallback(url: URL) {
    const current = await auth.completeCallback(url)
    setSession(current)
    setError('')
    setLoading(false)
  }

  return <AuthContext.Provider value={{
    auth, session, user: session?.user ?? null, loading: loading || signingOut, error, signOut, finishCallback,
  }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider is required.')
  return value
}
