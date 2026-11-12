import type { ReactNode } from 'react'
import { ArrowRight, Bookmark, CircleAlert, GitCompareArrows } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useWorkspace } from '../app/workspace'
import type { Building, Letter } from '../domain'

export function GradeBadge({ letter }: { letter: Letter | null }) {
  return <span className={'grade-badge grade-' + (letter ?? 'empty')} role="img" aria-label={letter ? 'Grade ' + letter : 'Grade unavailable'}>
    {letter ?? '–'}
  </span>
}

export function Skeleton({ label, variant, count = 3 }: {
  label: string; variant: 'report' | 'grades' | 'map' | 'rows' | 'compare' | 'issues'; count?: number
}) {
  return <div className={'skeleton skeleton-' + variant} role="status" aria-label={label}>
    {Array.from({ length: count }, (_, index) => <div className="skeleton-block" key={index} aria-hidden="true" />)}
  </div>
}

export function ErrorPanel({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="panel error-panel" role="alert"><CircleAlert size={20} />
    <div><strong>Something went wrong</strong><p>{message}</p>
      {retry && <button className="button secondary small" onClick={retry}>Try again</button>}
    </div>
  </div>
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="panel empty-state"><h2>{title}</h2><p>{children}</p>{action}</section>
}

export function BuildingActions({ building, compact = false }: { building: Building; compact?: boolean }) {
  const { auth, session, sessionLoading, savedLoading, savedError, savedIds, saveBuilding, compareIds, setCompareIds } = useWorkspace()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const saved = savedIds.includes(building.id)
  const comparing = compareIds.includes(building.id)

  async function toggleSave() {
    setError('')
    setPending(true)
    try { await saveBuilding(building.id, !saved) }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not update saved properties.') }
    finally { setPending(false) }
  }

  function toggleCompare() {
    setError('')
    try { setCompareIds(comparing ? compareIds.filter(id => id !== building.id) : [...compareIds, building.id]) }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not update your comparison.') }
  }

  return <div className="building-actions">
    <div className="action-row">
      {auth.available && !session && !sessionLoading
        ? <Link className="button secondary" to="/account"><Bookmark size={16} /> Sign in to save</Link>
        : <button className="button secondary" disabled={pending || savedLoading || !!savedError || (auth.available && building.sample)}
          title={savedError || (auth.available && building.sample ? 'Sample reports cannot be saved to an account.' : undefined)}
          aria-pressed={saved} onClick={toggleSave}><Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
          {pending ? 'Saving…' : saved ? compact ? 'Remove saved' : 'Saved' : 'Save'}</button>}
      <button className={'button ' + (comparing || compact ? 'secondary' : 'primary')} aria-pressed={comparing} onClick={toggleCompare}>
        <GitCompareArrows size={16} /> {comparing ? 'Remove from compare' : 'Add to compare'}
      </button>
    </div>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>
}

export function ReportLink({ id }: { id: string }) {
  return <Link className="text-link" to={'/building/' + encodeURIComponent(id)}>Open report <ArrowRight size={16} /></Link>
}
