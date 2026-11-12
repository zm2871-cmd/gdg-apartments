import { lazy, Suspense } from 'react'
import { ArrowUpRight, ChevronRight, Clock3, House, Info, MapPin } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useRequest } from '../app/useRequest'
import { useWorkspace } from '../app/workspace'
import { AssistantPanel } from '../components/AssistantPanel'
import { GradeRows, SourceLabel } from '../components/Grades'
import { RecentIssues } from '../components/RecentIssues'
import { BuildingActions, EmptyState, ErrorPanel, Skeleton } from '../components/ui'
import { formatDate, locality, type BuildingReport } from '../domain'
import { ServiceError } from '../services/contracts'
import { assistantService } from '../services/runtime'

const NeighborhoodMap = lazy(() => import('../components/NeighborhoodMap'))

export default function BuildingReportPage() {
  const { buildingId = '' } = useParams()
  const { housing } = useWorkspace()
  const { state, retry } = useRequest(signal => housing.getBuildingReport(buildingId, signal), buildingId)
  if (state.status === 'loading') return <div className="container report-page">
    <Skeleton label="Loading building report" variant="report" />
    <div className="report-grid">
      <Skeleton label="Loading grades" variant="grades" count={5} />
      <Skeleton label="Loading neighborhood map" variant="map" count={1} />
      <Skeleton label="Loading recent issues" variant="issues" />
    </div>
  </div>
  if (state.status === 'error') return <div className="container page">
    {state.error instanceof ServiceError && state.error.status === 404
      ? <EmptyState title="Building report not found" action={<Link className="button primary" to="/search">Search addresses</Link>}>
        This building report is unavailable. Search for an address to find another report.
      </EmptyState> : <ErrorPanel message={state.error.message} retry={retry} />}
  </div>
  return <Report key={buildingId} report={state.data} />
}

function Report({ report }: { report: BuildingReport }) {
  const { building, checkedAt, summary, grades, issues, coverage, changes, questions, nearby } = report
  return <div className="container report-page">
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <Link to="/search">Search results</Link><ChevronRight size={13} /><span>{building.borough}</span>
      <ChevronRight size={13} /><span aria-current="page">Building report</span>
    </nav>
    <div className="report-header">
      <div>
        <p className="eyebrow">Building report</p>
        <h1>{building.address}</h1>
        <div className="building-meta">
          <span><MapPin size={15} />{locality(building)}</span>
          {building.units !== undefined && <span>{building.units} residential units{building.unitScope === 'tax lot' ? ' on tax lot' : ''}</span>}
          {building.built && <span>Built {building.built}</span>}
          <span><Clock3 size={14} /> {building.sample ? 'Sample update' : 'Records checked'} {formatDate(checkedAt)}</span>
        </div>
      </div>
      <BuildingActions building={building} />
    </div>
    <section className="panel glance" aria-labelledby="glance-title">
      <span className="glance-icon"><House size={19} /></span>
      <div><h2 id="glance-title">At a glance</h2><p>{summary || (summary === '' ? 'No summary was supplied for this report.' : 'A summary is unavailable for this report.')}</p></div>
    </section>
    <div className="report-grid">
      <section className="panel grades-panel" aria-labelledby="grades-title">
        <div className="panel-heading"><h2 id="grades-title">Building grades</h2>
          <span>{building.sample ? 'Sample building evaluation' : report.confidence}</span></div>
        <p className="section-intro">Select a category to inspect the underlying records.</p>
        <GradeRows grades={grades} issues={issues} />
        <p className="grade-footnote"><Info size={15} /> Grades reflect recorded issues and available coverage. Complaints may be unverified.</p>
      </section>
      <aside className="neighborhood-column" aria-label="Neighborhood and changes">
        <Suspense fallback={<Skeleton label="Loading neighborhood map" variant="map" count={1} />}>
          <NeighborhoodMap building={building} markers={nearby} />
        </Suspense>
        <section className="panel changes" aria-labelledby="changes-title">
          <h2 id="changes-title">What changed?</h2>
          {changes?.length ? <ul>{changes.map(change => <li key={change.id}>
            <span className="change-icon"><ArrowUpRight size={17} /></span>
            <div><strong>{change.title}</strong><p>{change.description}</p><small>{change.period}</small></div>
          </li>)}</ul> : <p className="muted">{changes ? 'No changes were reported for this period.' : 'Historical changes are unavailable.'}</p>}
        </section>
      </aside>
      <div className="report-timeline">
        <RecentIssues issues={issues} sample={building.sample} />
        <section className="panel landlord" aria-labelledby="landlord-title">
          <div className="panel-heading"><h2 id="landlord-title">Questions to ask the landlord</h2>
            {building.sample && <span>Sample questions</span>}</div>
          {questions?.length ? <ol>{questions.map(question => <li key={question}>{question}</li>)}</ol>
            : <p className="muted">No landlord questions are available for this report.</p>}
        </section>
      </div>
    </div>
    <div className="report-notes">
      <details className="panel coverage-panel"><summary>Data sources and coverage <span>{coverage.length} sources</span></summary>
        {coverage.length ? <ul>{coverage.map(row => <li key={row.source.id}>
          <strong><SourceLabel source={row.source} /></strong><span className="capitalize">{row.status} · {row.count} records</span>
          {row.source.updatedAt && <span>Checked {formatDate(row.source.updatedAt)}</span>}
          {row.message && <p>{row.message}</p>}
        </li>)}</ul> : <p className="muted">Source coverage was unavailable.</p>}
      </details>
      <AssistantPanel building={building} service={assistantService} />
      <p className="report-disclaimer"><Info size={15} /> <span>{building.sample ? 'This demonstration uses fictional addresses, grades, events, and map markers. ' : ''}
        Public records may be delayed or incomplete. <Link to="/how-it-works">Read about coverage and limitations.</Link></span></p>
    </div>
  </div>
}
