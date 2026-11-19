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
  const { housing, session, sessionLoading, savedIds, savedLoading, compareIds, setCompareIds, preferences } = useWorkspace()
  const accountMode = housing.mode === 'api'
  const selectedIds = accountMode ? compareIds.filter(id => savedIds.includes(id)) : compareIds
  const ready = !accountMode || (!sessionLoading && !savedLoading && !!session?.preferences)
  const [replace, setReplace] = useState<string>()
  const [error, setError] = useState('')
  const { state, retry } = useRequest<BuildingComparison | BuildingReport>(
    signal => selectedIds.length === 1 ? housing.getBuildingReport(selectedIds[0], signal) : housing.compareBuildings(selectedIds, preferences, signal),
    JSON.stringify([selectedIds, preferences]), ready && selectedIds.length > 0,
  )
  const { state: savedState, retry: retrySavedReports } = useRequest(
    signal => Promise.allSettled(savedIds.map(id => housing.getBuildingReport(id, signal))),
    JSON.stringify(savedIds), accountMode && ready && savedIds.length > 0,
  )
  const result = state.status === 'success' ? state.data : undefined
  const comparison = result && 'reports' in result ? result : undefined
  const reports = comparison?.reports ?? (result && 'building' in result ? [result] : [])
  const canAdd = selectedIds.length < 3 || !!replace
  const replacement = reports.find(report => report.building.id === replace)

  function update(ids: string[]) {
    setError('')
    try { setCompareIds(ids); setReplace(undefined) }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not update your shortlist.') }
  }

  async function add(building: Building, signal: AbortSignal) {
    const resolved = await housing.resolveBuilding(building, signal)
    signal.throwIfAborted()
    if (selectedIds.includes(resolved.id)) throw new Error('That building is already in your comparison.')
    setCompareIds(replace ? selectedIds.map(id => id === replace ? resolved.id : id) : [...selectedIds, resolved.id])
    setReplace(undefined)
  }

  if (accountMode && (sessionLoading || savedLoading)) return <div className="container page"><Skeleton variant="rows" label="Loading your shortlist" /></div>
  if (accountMode && !session) return <div className="container page"><EmptyState title="Sign in to compare saved buildings"
    action={<Link className="button primary" to="/account">Go to account</Link>}>Your priorities and saved buildings belong to your account.</EmptyState></div>
  if (accountMode && !session?.preferences) return <div className="container page"><EmptyState title="Choose your priorities first"
    action={<Link className="button primary" to="/account">Set your priorities</Link>}>Tell us which building issues matter most to you before comparing your shortlist.</EmptyState></div>

  return <div className="container page">
    <div className="page-heading"><p className="eyebrow"><GitCompareArrows size={15} /> Your shortlist</p>
      <h1>{accountMode ? 'Compare saved buildings' : 'Compare buildings'}</h1><p>Review the available records for two or three buildings side by side.</p></div>
    <RatingEditor />
    {error && <ErrorPanel message={error} />}
    {canAdd && <section className="panel compare-picker" aria-labelledby="compare-picker-title">
      <div className="panel-heading"><h2 id="compare-picker-title">{replace ? 'Replace ' + (replacement?.building.address ?? 'building') : 'Add a building'}</h2>
        {replace ? <button className="button secondary small" onClick={() => setReplace(undefined)}>Cancel replacement</button> : <span>{selectedIds.length} of 3 selected</span>}
      </div>
      {accountMode ? savedIds.length === 0 ? <p>Save buildings from their reports first. <Link to="/search">Search buildings</Link>.</p>
        : savedState.status === 'loading' ? <Skeleton variant="rows" label="Loading saved buildings" count={1} />
          : savedState.status === 'error' ? <ErrorPanel message={savedState.error.message} retry={retrySavedReports} />
            : <div className="action-row">{savedState.data.flatMap(item => item.status === 'fulfilled' ? [item.value] : [])
              .filter(report => !selectedIds.includes(report.building.id))
              .map(report => <button key={report.building.id} className="button secondary small" onClick={() =>
                update(replace ? selectedIds.map(id => id === replace ? report.building.id : id) : [...selectedIds, report.building.id])}>
                {report.building.address}</button>)}
              <Link className="button secondary small" to="/saved">Manage saved buildings</Link></div>
        : <><AddressSearch key={replace ?? 'add'} label={replace ? 'Replacement address' : 'Address to compare'} button={replace ? 'Replace' : 'Add building'} onChoose={add} />
          <p className="muted">Choose an address from the suggestions or add a building from <Link to="/saved">Saved</Link>.</p></>}
    </section>}
    {accountMode && compareIds.length !== selectedIds.length && <p className="compare-notice">Only buildings saved to your account can appear in this ranking.</p>}
    {selectedIds.length === 0 ? <EmptyState title="Your comparison is empty"
      action={housing.mode === 'mock' ? <button className="button primary" onClick={() => update(sampleIds)}><Plus size={16} /> Compare two sample buildings</button> : undefined}>
      {accountMode ? 'Choose two saved buildings above to compare their reports.' : 'Add at least two buildings to compare their reports.'}
    </EmptyState> : state.status === 'loading' ? <Skeleton variant="compare" label="Loading building comparison" count={compareIds.length} /> :
      state.status === 'error' ? <><ErrorPanel message={state.error.message} retry={retry} /><div className="action-row">
        <button className="button secondary" onClick={() => update([])}>Clear selection</button>
      </div></> : <>
        {reports.length === 1 && <p className="compare-notice">Add one more building to see a weighted comparison.</p>}
        {comparison?.method === 'relative_shortlist' && comparison.details && <section className="panel compare-summary" aria-labelledby="compare-summary-title">
          <h2 id="compare-summary-title">Your shortlist, based on recorded issues</h2>
          <p>{comparison.details.reason}</p>
          {comparison.details.status === 'ranked' && <ol>{[...comparison.weighted].filter(row => row.value !== null)
            .sort((a, b) => a.value! - b.value!).map(row => <li key={row.id}>
              <Link to={'/building/' + encodeURIComponent(row.id)}>{reports.find(report => report.building.id === row.id)?.building.address ?? row.id}</Link>
            </li>)}</ol>}
          <p className="muted">This compares available public records within your shortlist. Fewer recorded issues do not prove a building is safer or problem-free.</p>
          <details><summary>How the ranking was calculated and what records support it</summary>
            {comparison.details.categories.map(detail => <section key={detail.category}>
              <h3>{categoryLabels[detail.category]}</h3>
              {!detail.comparable ? <p>{detail.reason ?? 'There is not enough comparable evidence for this category.'}</p> : <>
                {detail.reason && <p>{detail.reason}</p>}
                <p>{detail.measure === 'per_100_units' ? 'Recorded issue burden per 100 units' : 'Recorded nearby noise within 200 meters'} · {detail.sources.join(', ')}</p>
                {detail.values.map(value => {
                  const report = reports.find(item => item.building.id === value.id)
                  const issues = value.evidenceIds.flatMap(id => report?.issues.find(issue => issue.id === id) ?? [])
                  return <div key={value.id}><strong>{report?.building.address ?? value.id}: {value.burden?.toFixed(1) ?? 'Unavailable'}</strong>
                    {issues.length ? <ul>{issues.slice(0, 3).map(issue => <li key={issue.id}>{issue.description} · <time dateTime={issue.date}>{formatDate(issue.date)}</time> · {issue.source.url
                      ? <a href={issue.source.url} target="_blank" rel="noreferrer">{issue.source.label}</a> : issue.source.label}</li>)}</ul>
                      : <p className="muted">No qualifying records were returned. This does not confirm the absence of issues.</p>}
                    {issues.length > 3 && <p className="muted">Showing three of {issues.length} supporting records. <Link to={'/building/' + encodeURIComponent(value.id)}>View the full report</Link>.</p>}</div>
                })}
              </>}
            </section>)}
          </details>
        </section>}
        {comparison && comparison.method !== 'relative_shortlist' && <div className="compare-notice">
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
              {comparison && <div><dt>{comparison.method === 'relative_shortlist' ? 'Shortlist order' : comparison.scoreLabel}</dt><dd><strong>
                {comparison.method === 'relative_shortlist' ? comparison.details?.status === 'ranked'
                  ? (() => { const position = [...comparison.weighted].filter(row => row.value !== null).sort((a, b) => a.value! - b.value!)
                    .findIndex(row => row.id === report.building.id); return position < 0 ? 'Unavailable' : `${position + 1} of ${reports.length}` })()
                  : 'No clear order' : comparison.weighted.find(row => row.id === report.building.id)?.value?.toFixed(1) ?? 'Unavailable'}</strong></dd></div>}
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
              <button className="button secondary small" onClick={() => update(selectedIds.filter(id => id !== report.building.id))}>
                <X size={14} /> Remove<span className="sr-only"> {report.building.address}</span></button>
            </div>
          </article>)}
        </div>
      </>}
  </div>
}
