import { useState, type CSSProperties } from 'react'
import { GitCompareArrows, Plus, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useRequest } from '../app/useRequest'
import { useWorkspace } from '../app/workspace'
import { AddressSearch } from '../components/AddressSearch'
import { RatingEditor } from '../components/RatingEditor'
import { EmptyState, ErrorPanel, GradeBadge, ReportLink, Skeleton } from '../components/ui'
import { categories, categoryLabels, formatDate, locality, type Building, type BuildingComparison, type BuildingReport } from '../domain'
import { samplePreviews } from '../services/mock'

const sampleIds = samplePreviews.map(({ building }) => building.id)

export default function ComparePage() {
  const { housing, compareIds, setCompareIds, preferences } = useWorkspace()
  const [replace, setReplace] = useState<string>()
  const [error, setError] = useState('')
  const { state, retry } = useRequest<BuildingComparison | BuildingReport>(
    signal => compareIds.length === 1 ? housing.getBuildingReport(compareIds[0], signal) : housing.compareBuildings(compareIds, preferences, signal),
    JSON.stringify([compareIds, preferences]), compareIds.length > 0,
  )
  const result = state.status === 'success' ? state.data : undefined
  const comparison = result && 'reports' in result ? result : undefined
  const reports = comparison?.reports ?? (result && 'building' in result ? [result] : [])
  const canAdd = compareIds.length < 3 || !!replace
  const replacement = reports.find(report => report.building.id === replace)

  function update(ids: string[]) {
    setError('')
    try { setCompareIds(ids); setReplace(undefined) }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not update your shortlist.') }
  }

  async function add(building: Building, signal: AbortSignal) {
    const resolved = await housing.resolveBuilding(building, signal)
    signal.throwIfAborted()
    if (compareIds.includes(resolved.id)) throw new Error('That building is already in your comparison.')
    setCompareIds(replace ? compareIds.map(id => id === replace ? resolved.id : id) : [...compareIds, resolved.id])
    setReplace(undefined)
  }

  return <div className="container page">
    <div className="page-heading"><p className="eyebrow"><GitCompareArrows size={15} /> Your shortlist</p>
      <h1>Compare buildings</h1><p>Review the available records for two or three buildings side by side.</p></div>
    <RatingEditor />
    {error && <ErrorPanel message={error} />}
    {canAdd && <section className="panel compare-picker" aria-labelledby="compare-picker-title">
      <div className="panel-heading"><h2 id="compare-picker-title">{replace ? 'Replace ' + (replacement?.building.address ?? 'building') : 'Add a building'}</h2>
        {replace ? <button className="button secondary small" onClick={() => setReplace(undefined)}>Cancel replacement</button> : <span>{compareIds.length} of 3 selected</span>}
      </div>
      <AddressSearch key={replace ?? 'add'} label={replace ? 'Replacement address' : 'Address to compare'} button={replace ? 'Replace' : 'Add building'} onChoose={add} />
      <p className="muted">Choose an address from the suggestions or add a building from <Link to="/saved">Saved</Link>.</p>
    </section>}
    {compareIds.length === 0 ? <EmptyState title="Your comparison is empty"
      action={housing.mode === 'mock' ? <button className="button primary" onClick={() => update(sampleIds)}><Plus size={16} /> Compare two sample buildings</button> : undefined}>
      Add at least two buildings to compare their reports.
    </EmptyState> : state.status === 'loading' ? <Skeleton variant="compare" label="Loading building comparison" count={compareIds.length} /> :
      state.status === 'error' ? <><ErrorPanel message={state.error.message} retry={retry} /><div className="action-row">
        <button className="button secondary" onClick={() => update([])}>Clear selection</button>
      </div></> : <>
        {reports.length === 1 && <p className="compare-notice">Add one more building to see a weighted comparison.</p>}
        {comparison && <div className="compare-notice">
          <p>{comparison.sharedCategories.length ? 'Comparable categories: ' + comparison.sharedCategories.map(key => categoryLabels[key]).join(', ') + '.' : 'Comparable category scores are unavailable.'}</p>
          {comparison.missingCategories.length > 0 && <p>Missing comparable data: {comparison.missingCategories.map(key => categoryLabels[key]).join(', ')}.</p>}
        </div>}
        <div className="compare-grid" style={{ '--columns': reports.length, '--value-rows': comparison ? 10 : 9 } as CSSProperties}>
          {reports.map(report => <article className="panel compare-building" key={report.building.id}>
            <div className="compare-building-header">
              <span className="eyebrow">{report.building.sample ? 'Sample building' : report.building.borough}</span>
              <h2>{report.building.address}</h2><p className="muted">{locality(report.building)}</p>
              <ReportLink id={report.building.id} />
            </div>
            <dl className="comparison-values">
              <div><dt>Overall grade</dt><dd><GradeBadge letter={report.overall} /></dd></div>
              {categories.map(category => <div key={category}><dt>{categoryLabels[category]}</dt>
                <dd><GradeBadge letter={report.grades.find(grade => grade.category === category)?.letter ?? null} /></dd></div>)}
              {comparison && <div><dt>{comparison.scoreLabel}</dt><dd><strong>
                {comparison.weighted.find(row => row.id === report.building.id)?.value?.toFixed(1) ?? 'Unavailable'}</strong></dd></div>}
              <div><dt>Proximity</dt><dd>{report.proximity ?? 'Unavailable'}</dd></div>
              <div><dt>Data confidence</dt><dd>{report.confidence}</dd></div>
              <div className="comparison-recent"><dt>Recent issues</dt><dd>{report.issues.length ? <ul>{report.issues.slice(0, 2).map(issue =>
                <li key={issue.id}>{issue.title} <time dateTime={issue.date}>{formatDate(issue.date)}</time></li>)}</ul> : 'No recent issues supplied'}</dd></div>
            </dl>
            <div className="action-row compare-card-actions">
              <button className="button secondary small" onClick={() => {
                setReplace(report.building.id)
                requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.compare-picker input')?.focus())
              }}>Replace<span className="sr-only"> {report.building.address}</span></button>
              <button className="button secondary small" onClick={() => update(compareIds.filter(id => id !== report.building.id))}>
                <X size={14} /> Remove<span className="sr-only"> {report.building.address}</span></button>
            </div>
          </article>)}
        </div>
      </>}
  </div>
}
