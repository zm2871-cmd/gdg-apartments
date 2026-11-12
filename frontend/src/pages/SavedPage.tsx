import { useState } from 'react'
import { Bookmark, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useRequest } from '../app/useRequest'
import { useWorkspace } from '../app/workspace'
import { BuildingActions, EmptyState, ErrorPanel, ReportLink, Skeleton } from '../components/ui'
import { locality } from '../domain'

export default function SavedPage() {
  const { housing, auth, session, sessionLoading, savedIds, savedLoading, savedError, retrySaved, saveBuilding } = useWorkspace()
  const { state, retry } = useRequest(signal => Promise.allSettled(savedIds.map(id => housing.getBuildingReport(id, signal))),
    JSON.stringify(savedIds), !savedLoading && savedIds.length > 0)
  const count = savedIds.length

  return <div className="container page">
    <div className="page-heading"><p className="eyebrow"><Bookmark size={15} /> Your shortlist</p>
      <h1>Saved properties</h1><p>{housing.mode === 'mock' ? 'Revisit sample buildings saved in this browser.' : 'Revisit buildings saved to your account.'}</p></div>
    {sessionLoading || savedLoading ? <Skeleton variant="rows" label="Loading saved properties" /> :
      auth.available && !session ? <EmptyState title="Sign in to view saved properties"
        action={<Link className="button primary" to="/account">Go to account</Link>}>Saved reports are tied to your account.</EmptyState> :
      savedError ? <ErrorPanel message={savedError} retry={retrySaved} /> :
      !count ? <EmptyState title="No saved properties yet" action={<Link className="button primary" to="/search">Search buildings</Link>}>
        Save a building from its report to find it here.
      </EmptyState> : state.status === 'loading' ? <Skeleton variant="rows" label="Loading saved reports" count={Math.min(3, count)} /> :
      state.status === 'error' ? <ErrorPanel message={state.error.message} retry={retry} /> :
      <ul className="saved-list">{state.data.map((item, index) => item.status === 'fulfilled' ?
        <li className="panel saved-card" key={item.value.building.id}>
          <div><p className="eyebrow">{item.value.building.sample ? 'Sample building' : item.value.building.borough}</p>
            <h2>{item.value.building.address}</h2>
            <p className="saved-location muted"><MapPin size={15} />{locality(item.value.building)}</p>
            <ReportLink id={item.value.building.id} />
          </div><BuildingActions building={item.value.building} compact />
        </li> : <UnavailableBuilding key={savedIds[index]} id={savedIds[index]} retry={retry} remove={saveBuilding} />)}</ul>}
  </div>
}

function UnavailableBuilding({ id, retry, remove }: { id: string; retry: () => void; remove: (id: string, saved: boolean) => Promise<void> }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  return <li className="panel saved-card">
    <div><h2>Saved report unavailable</h2><p className="muted">This building report could not be loaded.</p>
      {error && <p role="alert" className="inline-error">{error}</p>}</div>
    <div className="action-row"><button className="button secondary" onClick={retry}>Try again</button>
      <button className="button secondary" disabled={loading} onClick={async () => {
        setLoading(true)
        try { await remove(id, false) }
        catch (error) { setError(error instanceof Error ? error.message : 'Could not remove the saved report.') }
        finally { setLoading(false) }
      }}>Remove saved</button>
    </div>
  </li>
}
