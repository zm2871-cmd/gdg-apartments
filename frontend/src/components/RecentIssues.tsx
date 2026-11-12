import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { categoryLabels, formatDate, type Issue } from '../domain'
import { SourceLabel } from './Grades'

export function RecentIssues({ issues, sample }: { issues: Issue[]; sample: boolean }) {
  const [visible, setVisible] = useState(3)
  return <section className="panel recent-issues" aria-labelledby="recent-title">
    <div className="panel-heading"><h2 id="recent-title">Recent issues</h2><span>{sample ? 'Sample timeline' : 'Recorded events'}</span></div>
    {issues.length === 0 ? <p className="muted">No recent issues were supplied for this report.</p> :
      <ol className="timeline">{issues.slice(0, visible).map(issue => <li key={issue.id}>
        <div className="issue-heading"><h3>{issue.title}</h3><span className={'issue-status status-' + issue.status}>
          {issue.status === 'unknown' ? 'Status unknown' : issue.status === 'open' ? 'Open' : 'Resolved'}
        </span></div>
        <p>{issue.description}</p>
        <div className="issue-meta"><time dateTime={issue.date}>{formatDate(issue.date)}</time>
          <span>{categoryLabels[issue.category]}</span><SourceLabel source={issue.source} /></div>
      </li>)}</ol>}
    {issues.length > 3 && <div className="timeline-controls">
      {visible < issues.length && <button className="button secondary small" onClick={() => setVisible(value => value + 3)}>
        Show more issues <ChevronDown size={15} />
      </button>}
      <span className="muted" role="status">Showing {Math.min(visible, issues.length)} of {issues.length}</span>
    </div>}
  </section>
}
