import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Building2, MapPin } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useRequest } from '../app/useRequest'
import { useWorkspace } from '../app/workspace'
import { AddressSearch } from '../components/AddressSearch'
import { EmptyState, ErrorPanel, Skeleton } from '../components/ui'
import { locality, type Building } from '../domain'
import { sampleBuildings } from '../services/mock'

export default function SearchPage() {
  const { housing } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const query = (params.get('q') ?? '').trim()
  const [opening, setOpening] = useState('')
  const [openError, setOpenError] = useState('')
  const pendingResult = useRef<AbortController | null>(null)
  useEffect(() => () => pendingResult.current?.abort(), [])
  const eligible = query.length >= 3 && query.length <= 120
  const { state, retry } = useRequest(signal => housing.searchBuildings(query, signal), query, eligible)

  async function open(building: Building, signal: AbortSignal) {
    const resolved = await housing.resolveBuilding(building, signal)
    signal.throwIfAborted()
    navigate('/building/' + encodeURIComponent(resolved.id))
  }

  async function openResult(building: Building) {
    pendingResult.current?.abort()
    const controller = new AbortController()
    pendingResult.current = controller
    setOpening(building.id)
    setOpenError('')
    try { await open(building, controller.signal) }
    catch (error) {
      if (!controller.signal.aborted) setOpenError(error instanceof Error ? error.message : 'Could not open this address.')
    } finally {
      if (!controller.signal.aborted) setOpening('')
    }
  }

  return <div className="container page narrow-page">
    <div className="page-heading"><p className="eyebrow">NYC address lookup</p><h1>Find a building</h1>
      <p>Search a street address to see its building report and surrounding issues.</p></div>
    <AddressSearch key={query} initial={query} onSearch={value => { pendingResult.current?.abort(); setOpening(''); setOpenError(''); setParams({ q: value }) }} onChoose={open} />
    <div className="search-results">
      {openError && <ErrorPanel message={openError} />}
      {!query && (housing.mode === 'mock' ? <>
        <div className="panel-heading results-heading"><h2>Sample buildings</h2><span>Fictional addresses</span></div>
        <ul className="result-list">{sampleBuildings.map(building => <li key={building.id}>
          <Link className="panel result" to={'/building/' + building.id}><Building2 size={22} />
            <span><strong>{building.address}</strong><small>{locality(building)}</small></span><ArrowRight size={18} className="result-arrow" />
          </Link>
        </li>)}</ul>
      </> : <EmptyState title="Enter an NYC address">Start with the street number and street name.</EmptyState>)}
      {query && !eligible && <EmptyState title="Check the search address">Enter an address between 3 and 120 characters.</EmptyState>}
      {eligible && (state.status === 'loading' ? <Skeleton label="Loading search results" variant="rows" /> :
        state.status === 'error' ? <ErrorPanel message={state.error.message} retry={retry} /> :
          state.data.length === 0 ? <EmptyState title="No matching addresses">
            {housing.mode === 'mock' ? 'Try a sample address like 123 Example Street or 48 Sample Avenue.' : 'Try the street number, street name, and borough.'}
          </EmptyState> : <>
            <div className="panel-heading results-heading"><h2>Search results</h2><span role="status">{state.data.length} {state.data.length === 1 ? 'address' : 'addresses'}</span></div>
            <ul className="result-list">{state.data.map(building => <li key={building.id}>
              <button className="panel result" type="button" disabled={!!opening} onClick={() => void openResult(building)}>
                <MapPin size={21} /><span><strong>{building.address}</strong><small>{building.borough}{building.sample ? ' · Sample data' : ''}</small></span>
                <span className="result-arrow">{opening === building.id ? 'Opening…' : <ArrowRight size={18} />}</span>
              </button>
            </li>)}</ul>
          </>)}
    </div>
  </div>
}
