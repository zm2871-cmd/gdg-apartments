import { useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Link } from 'react-router-dom'
import { Bookmark, ChevronDown, UserRound } from 'lucide-react'
import { useAuth } from '../app/AuthContext'

export function accountName(user: User | null) {
  const metadata = user?.user_metadata
  const name = metadata?.full_name ?? metadata?.name ?? metadata?.user_name
  return typeof name === 'string' && name.trim() ? name.trim() : user?.email?.split('@')[0] || 'Your account'
}

export function AccountSignOut() {
  const { signOut } = useAuth()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  return <div><button type="button" className="button secondary small" disabled={pending} onClick={async () => {
    if (busy.current) return
    busy.current = true
    setPending(true); setError('')
    try { await signOut() }
    catch (error) { setError(error instanceof Error ? error.message : 'Sign-out failed. Try again.') }
    finally { busy.current = false; setPending(false) }
  }}>{pending ? 'Signing out…' : 'Sign out'}</button>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>
}

export function AccountMenu() {
  const { user } = useAuth()
  const details = useRef<HTMLDetailsElement>(null)
  const name = accountName(user)
  const initials = name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()
  function close() { if (details.current) details.current.open = false }
  return <details className="account-menu" ref={details} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) close()
  }} onKeyDown={event => {
    if (event.key === 'Escape') { close(); details.current?.querySelector('summary')?.focus() }
  }}>
    <summary aria-label={'Account menu for ' + name}><span className="account-initials" aria-hidden="true">{initials}</span>
      <span className="account-name">{name}</span><ChevronDown size={13} aria-hidden="true" /></summary>
    <div className="account-menu-content">
      <Link to="/account" onClick={close}><UserRound size={15} /> Account settings</Link>
      <Link to="/saved" onClick={close}><Bookmark size={15} /> Saved Apartments</Link>
      <AccountSignOut />
    </div>
  </details>
}
