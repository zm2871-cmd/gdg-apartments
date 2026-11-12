import { useId, useState } from 'react'
import { Bug, ChevronDown, Flame, Rat, Volume2, Wrench } from 'lucide-react'
import { categoryLabels, formatDate, type Grade, type GradeCategory, type Issue, type Source } from '../domain'
import { GradeBadge } from './ui'

export const categoryIcons = { maintenance: Wrench, heat: Flame, pests: Rat, bedbugs: Bug, noise: Volume2 }

export function SourceLabel({ source }: { source: Source }) {
  return source.url ? <a className="source-link" href={source.url}>{source.label}</a> : <span>{source.label}</span>
}

export function GradeRows({ grades, issues }: { grades: Grade[]; issues: Issue[] }) {
  const [selected, setSelected] = useState<GradeCategory | null>(null)
  const id = useId()
  if (!grades.length) return <p className="muted">No category evaluations are available.</p>
  return <div className="grade-list">
    {grades.map(grade => {
      const Icon = categoryIcons[grade.category]
      const open = selected === grade.category
      const detailsId = id + '-' + grade.category
      return <div className={'grade-entry' + (open ? ' expanded' : '')} key={grade.category}>
        <button type="button" className="grade-row" aria-expanded={open} aria-controls={detailsId}
          onClick={() => setSelected(open ? null : grade.category)}>
          <GradeBadge letter={grade.letter} />
          <span className="grade-row-copy">
            <strong><Icon size={15} aria-hidden="true" />{categoryLabels[grade.category]}</strong>
            <span>{grade.description}</span>
          </span>
          <span className="grade-row-meta">
            <span>{grade.countLabel ?? (grade.count === undefined ? 'Count unavailable' : grade.count + ' records')}</span>
            {grade.period && <span className="sr-only">{grade.period}</span>}
            {grade.coverage !== 'available' && <span className="coverage-label">{grade.coverage === 'limited' ? 'Limited coverage' : 'Data unavailable'}</span>}
          </span>
          <ChevronDown size={16} className="grade-chevron" aria-hidden="true" />
        </button>
        <div id={detailsId} hidden={!open}>
          {open && <GradeDetails grade={grade} issues={issues.filter(issue => issue.category === grade.category)} />}
        </div>
      </div>
    })}
  </div>
}

function GradeDetails({ grade, issues }: { grade: Grade; issues: Issue[] }) {
  return <div className="grade-details">
    <dl className="detail-grid">
      <div><dt>Observation period</dt><dd>{grade.period ?? 'Unavailable'}</dd></div>
      <div><dt>Last checked</dt><dd>{grade.updatedAt ? formatDate(grade.updatedAt) : 'Unavailable'}</dd></div>
      <div><dt>Data coverage</dt><dd className="capitalize">{grade.coverage}</dd></div>
      <div><dt>Sources</dt><dd>{grade.sources.length ? grade.sources.map(source =>
        <div key={source.id}><SourceLabel source={source} /></div>) : 'Unavailable'}</dd></div>
    </dl>
    {grade.subcategories.length > 0 && <ul className="subcategory-list">
      {grade.subcategories.map(sub => <li key={sub.id}><GradeBadge letter={sub.letter} />
        <strong>{sub.label}</strong>{sub.count !== undefined && <span>{sub.count} records</span>}</li>)}
    </ul>}
    <h3>Supporting records</h3>
    {issues.length ? <ul className="record-list">{issues.map(issue => <li key={issue.id}>
      <strong>{issue.title}</strong><span>{issue.description}</span>
      <small><time dateTime={issue.date}>{formatDate(issue.date)}</time> · <SourceLabel source={issue.source} /></small>
    </li>)}</ul> : <p className="muted">No supporting records were supplied for this category.</p>}
    {grade.limitations && <p className="detail-note">{grade.limitations}</p>}
  </div>
}
