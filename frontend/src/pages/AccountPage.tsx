import { useEffect, useState, type FormEvent } from 'react'
import { UserRound } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../app/workspace'
import { EmptyState, ErrorPanel, Skeleton } from '../components/ui'
import { categories, categoryLabels, type CategoryWeights } from '../domain'
import { defaultPreferences } from '../services/preferences'

export default function AccountPage() {
  const { auth, housing, session, sessionLoading, sessionError, signOut, savePreferences } = useWorkspace()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [weights, setWeights] = useState<CategoryWeights>(() => defaultPreferences(housing.scoring).weights)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState(params.get('error') === 'signin' ? 'The sign-in link could not be verified. Request a new link.' : '')
  const accountWeights = session?.preferences
  const firstVisit = session != null && accountWeights == null

  useEffect(() => {
    if (session) setWeights(accountWeights ?? defaultPreferences(housing.scoring).weights)
  }, [accountWeights, housing.scoring, session])

  async function savePriorities(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(''); setNotice('')
    if (!Object.values(weights).some(Boolean)) {
      setError('Choose at least one priority above zero.')
      return
    }
    setPending(true)
    try {
      await savePreferences({ mode: 'semi', weights, subcategories: {} })
      if (firstVisit) navigate('/saved', { replace: true })
      else setNotice('Your priorities were saved to your account.')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save your priorities.')
    } finally {
      setPending(false)
    }
  }

  return <div className="container page narrow-page">
    <div className="page-heading"><p className="eyebrow"><UserRound size={15} /> Account access</p>
      <h1>{firstVisit ? 'Set your priorities' : 'Your account'}</h1>
      {firstVisit && <p>Tell us which building issues matter most to you. You can change your choices later.</p>}</div>
    {!auth.available ? <EmptyState title="Account access is unavailable"
      action={<Link className="button primary" to="/saved">View saved properties</Link>}>Demonstration properties are saved in this browser.</EmptyState> :
      sessionLoading ? <Skeleton variant="rows" label="Checking account session" count={1} /> :
      <section className="panel account-panel">
        {sessionError && <ErrorPanel message={sessionError} />}
        {session ? <><p>Signed in as {session.email}</p>
          <div className="account-priorities"><h2>{firstVisit ? 'What matters most to you?' : 'Your building priorities'}</h2>
            <p>Set each priority from 0 (not important to your comparison) to 5 (most important). These choices change how your shortlisted buildings are compared; they do not change the underlying records.</p>
            <form className="priority-form" onSubmit={savePriorities}>
              <fieldset className="priority-list"><legend className="sr-only">Building priorities</legend>
                {categories.map(category => <div className="priority-row" key={category}>
                  <label htmlFor={'priority-' + category}>{categoryLabels[category]}</label>
                  <input id={'priority-' + category} type="range" min={0} max={5} step={1}
                    value={weights[category]} disabled={pending} aria-valuetext={weights[category] + ' out of 5'}
                    onChange={event => setWeights(current => ({ ...current, [category]: event.target.valueAsNumber }))} />
                  <output htmlFor={'priority-' + category}>{weights[category]} / 5</output>
                </div>)}
              </fieldset>
              <button className="button primary" type="submit" disabled={pending}>{pending ? 'Saving…' : firstVisit ? 'Save and continue' : 'Save priorities'}</button>
            </form>
          </div>
          <button className="button secondary" disabled={pending} onClick={async () => {
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
