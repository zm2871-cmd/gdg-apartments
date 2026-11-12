import { useState } from 'react'
import { UserRound } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../app/workspace'
import { EmptyState, ErrorPanel, Skeleton } from '../components/ui'

export default function AccountPage() {
  const { auth, session, sessionLoading, sessionError, signOut } = useWorkspace()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState(params.get('error') === 'signin' ? 'The sign-in link could not be verified. Request a new link.' : '')
  return <div className="container page narrow-page">
    <div className="page-heading"><p className="eyebrow"><UserRound size={15} /> Account access</p><h1>Your account</h1></div>
    {!auth.available ? <EmptyState title="Account access is unavailable"
      action={<Link className="button primary" to="/saved">View saved properties</Link>}>Demonstration properties are saved in this browser.</EmptyState> :
      sessionLoading ? <Skeleton variant="rows" label="Checking account session" count={1} /> :
      <section className="panel account-panel">
        {sessionError && <ErrorPanel message={sessionError} />}
        {session ? <><h2>Signed in</h2><p>{session.email}</p><button className="button secondary" disabled={pending} onClick={async () => {
          setPending(true); setError(''); setNotice('')
          try { await signOut(); setNotice('You’re signed out.') }
          catch (error) { setError(error instanceof Error ? error.message : 'Could not sign out.') }
          finally { setPending(false) }
        }}>Sign out</button></> : <form onSubmit={async event => {
          event.preventDefault()
          setPending(true); setNotice(''); setError('')
          try { setNotice(await auth.signIn(email.trim())) }
          catch (error) { setError(error instanceof Error ? error.message : 'Could not send a sign-in link.') }
          finally { setPending(false) }
        }}>
          <h2>Sign in by email</h2><p>We’ll send a link to sign in and access your saved properties.</p>
          <label htmlFor="account-email">Email address</label><input required type="email" id="account-email" maxLength={254}
            value={email} autoComplete="email" onChange={event => setEmail(event.target.value)} />
          <button type="submit" className="button primary" disabled={pending}>{pending ? 'Sending…' : 'Send sign-in link'}</button>
        </form>}
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert" className="inline-error">{error}</p>}
      </section>}
  </div>
}
