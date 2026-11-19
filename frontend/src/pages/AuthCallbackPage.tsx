import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { consumeDestination, loginDestination } from '../app/authNavigation'
import { Skeleton } from '../components/ui'

export default function AuthCallbackPage() {
  const { finishCallback } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const callback = useRef(new URL(window.location.href))
  const operation = useRef<Promise<void> | null>(null)
  const destination = useRef<string | undefined>(undefined)

  useEffect(() => {
    let active = true
    destination.current ??= consumeDestination(sessionStorage, callback.current.searchParams.get('next'))
    operation.current ??= finishCallback(callback.current)
    operation.current.then(() => {
      if (active) navigate(destination.current!, { replace: true })
    }).catch((error: unknown) => {
      if (!active) return
      const message = error instanceof Error ? error.message : 'Sign-in could not be completed.'
      setError(message)
      // Remove the one-time code and provider error parameters from browser history.
      navigate(loginDestination(destination.current!) + '&error=callback', { replace: true, state: { authError: message } })
    })
    return () => { active = false }
    // This route processes its original URL once. The auth adapter also deduplicates the code exchange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  return <div className="container page narrow-page">
    <h1>Completing sign-in</h1>
    {error ? <p role="alert" className="inline-error">{error} <Link to="/login">Return to login</Link></p> :
      <Skeleton label="Completing sign-in" variant="rows" count={1} />}
  </div>
}
