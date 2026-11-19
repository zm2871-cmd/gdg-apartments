import { useRef, useState } from 'react'
import { UserRound } from 'lucide-react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { rememberDestination, safeDestination } from '../app/authNavigation'
import { oauthProviders } from '../services/auth'
import type { OAuthProvider } from '../services/contracts'
import { Skeleton } from '../components/ui'

export default function AccessPage({ signup = false }: { signup?: boolean }) {
  const { auth, user, loading, error: sessionError } = useAuth()
  const [params] = useSearchParams()
  const location = useLocation()
  const next = safeDestination(params.get('next'))
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState<OAuthProvider | 'email' | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState(params.has('error') ? location.state?.authError || 'The sign-in request failed or was cancelled. Please try again.' : '')
  const busy = useRef(false)

  async function submit(provider?: OAuthProvider) {
    if (!auth.available || busy.current) return
    busy.current = true
    setPending(provider ?? 'email')
    setError('')
    setNotice('')
    let leaving = false
    try {
      rememberDestination(sessionStorage, next)
      const redirectTo = window.location.origin + '/auth/callback'
      if (provider) {
        await auth.signInWithOAuth(provider, redirectTo)
        leaving = true
      } else {
        setNotice(await auth.signInWithEmail(email.trim(), redirectTo, signup))
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign-in could not be completed. Please try again.')
    } finally {
      if (!leaving) { busy.current = false; setPending(null) }
    }
  }

  if (loading) return <div className="container page narrow-page"><Skeleton label="Checking your account" variant="rows" count={1} /></div>
  if (user && !params.has('error')) return <Navigate to={next} replace />
  return <div className="container page narrow-page">
    <div className="page-heading"><p className="eyebrow"><UserRound size={15} /> Account access</p>
      <h1>{signup ? 'Create your account' : 'Log in'}</h1></div>
    <section className="panel account-panel">
      {auth.configurationError && <p className="auth-configuration" role="alert">{auth.configurationError}</p>}
      {sessionError && <p className="inline-error" role="alert">{sessionError}</p>}
      <div className="oauth-options" role="group" aria-label="Sign-in options">
        {oauthProviders.map(provider => <button key={provider.id} className="button secondary" disabled={!!pending || !auth.available}
          onClick={() => void submit(provider.id)}>
          {pending === provider.id ? 'Opening ' + provider.label + '…' : 'Continue with ' + provider.label}
        </button>)}
      </div>
      <div className="auth-divider">or continue by email</div>
      <form onSubmit={event => { event.preventDefault(); void submit() }}>
        <label htmlFor="account-email">Email address</label>
        <input required type="email" id="account-email" maxLength={254} value={email} disabled={!!pending || !auth.available}
          autoComplete="email" onChange={event => setEmail(event.target.value)} />
        <button type="submit" className="button primary" disabled={!!pending || !auth.available}>
          {pending === 'email' ? 'Sending…' : signup ? 'Send signup link' : 'Send sign-in link'}
        </button>
      </form>
      <p className="muted">Open the email link in the same browser where you requested it.</p>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert" className="inline-error">{error}</p>}
      <p>{signup ? 'Already have an account?' : 'New to Hearthstone Hub?'}{' '}
        <Link to={(signup ? '/login?' : '/signup?') + new URLSearchParams({ next })}>{signup ? 'Log in' : 'Sign up'}</Link>
      </p>
    </section>
  </div>
}
