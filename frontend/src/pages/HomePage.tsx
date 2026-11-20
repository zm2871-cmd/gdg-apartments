import type { CSSProperties } from 'react'
import { ArrowRight, ClipboardList, GitCompareArrows, House, MapPin, Search, ShieldCheck } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../app/workspace'
import { AddressSearch } from '../components/AddressSearch'
import { StreetScene } from '../components/StreetScene'
import { WaterTowerIcon } from '../components/Skyline'
import { categoryIcons } from '../components/Grades'
import { GradeBadge } from '../components/ui'
import { categories, categoryLabels, locality } from '../domain'
import { samplePreviews } from '../services/mock'

const sample = samplePreviews[0]
const exampleNotes = ['Housing code violations', 'Reported outages', 'Inspection concerns', 'Filing history', 'Complaints on the block']

export function HomePage() {
  const { housing } = useWorkspace()
  const navigate = useNavigate()
  const mock = housing.mode === 'mock'
  return <>
    <section className="home-hero">
      <div className="hero-sky" aria-hidden="true"><span /><span /><span /></div>
      <StreetScene className="hero-street" />
      <div className="container hero-grid">
        <div className="hero-copy">
          <p className="eyebrow"><MapPin size={15} /> NYC apartment research · all five boroughs</p>
          <h1>Know the building <span className="gradient-text">before you sign</span> the lease.</h1>
          <p className="hero-description">Explore NYC building records, neighborhood conditions, and potential apartment concerns before deciding where to live.</p>
          <AddressSearch onSearch={query => navigate('/search?q=' + encodeURIComponent(query))}
            onChoose={async (building, signal) => {
              const resolved = await housing.resolveBuilding(building, signal)
              signal.throwIfAborted()
              navigate('/building/' + encodeURIComponent(resolved.id))
            }} />
          {mock && <p className="hero-example">Try a sample address <Link to="/search?q=123%20Example%20Street">123 Example Street <ArrowRight size={15} /></Link></p>}
        </div>
        <div className="hero-preview" aria-label="Sample report preview">
          {/* The sample report as a 3D glass walk-up: one floor per category, tinted by its grade.
              Hovering lifts the floors apart. The water tower and address sign sit on the roof. */}
          <div className="tower-scene">
            <div className="tower">
              <div className="tower-shadow" aria-hidden="true" />
              <div className="tower-floor tower-lobby" style={{ '--i': 0 } as CSSProperties} aria-hidden="true">
                <div className="face face-top" />
                <div className="face face-front"><span className="lobby-door" /></div>
                <div className="face face-side" />
              </div>
              <ol className="tower-floors">{sample.grades.map(({ category, letter }, index) => {
                const Icon = categoryIcons[category]
                return <li key={category} className={'tower-floor tint-' + (letter ?? 'none')} style={{ '--i': sample.grades.length - index } as CSSProperties}>
                  <div className="face face-top" />
                  <div className="face face-front"><Icon size={14} /><span>{categoryLabels[category]}</span><i className="tower-windows" aria-hidden="true" /></div>
                  <div className="face face-side"><GradeBadge letter={letter} /></div>
                </li>
              })}</ol>
              <div className="tower-roof" style={{ '--i': sample.grades.length + 1 } as CSSProperties}>
                <div className="tower-tank" aria-hidden="true"><WaterTowerIcon size={54} /></div>
              </div>
            </div>
            <div className="tower-sign">
              <span className="tower-pill">Sample report</span>
              <h2>{sample.building.address}</h2>
              <p className="preview-location">{locality(sample.building)}</p>
            </div>
          </div>
          <Link className="text-link preview-link" to={mock ? '/building/' + sample.building.id : '/how-it-works'}>
            {mock ? 'Explore the sample report' : 'How to read a report'} <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </section>
    <section className="container home-section">
      <div className="section-heading"><h2>From address to a closer look</h2><p>See what’s been recorded, then bring better questions to your next viewing.</p></div>
      <div className="home-steps">
        <article className="panel"><Search size={24} /><h3>Find a building</h3><p>Search for an NYC street address and open its building report.</p></article>
        <article className="panel"><ClipboardList size={24} /><h3>Read the records</h3><p>Open a category to see the evidence, its source, and where coverage is limited.</p></article>
        <article className="panel"><GitCompareArrows size={24} /><h3>Compare your shortlist</h3><p>Put up to three buildings side by side and adjust the weights for the issues you care about.</p></article>
      </div>
    </section>
    <section className="container home-section home-method">
      <div>
        <h2>What goes into a report?</h2>
        <div className="method-list">{categories.map((category, index) => {
          const Icon = categoryIcons[category]
          return <div key={category}><Icon size={19} /><div><strong>{categoryLabels[category]}</strong><span>{exampleNotes[index]}</span></div></div>
        })}</div>
      </div>
      <div className="method-copy">
        <ShieldCheck size={26} /><h3>Grades depend on the evidence</h3>
        <p>Where comparable evidence is available, grades summarize recorded issues for each category. Source coverage and observation periods help you interpret the result.</p>
        <p>Public records can lag, miss unreported issues, or describe a whole tax lot. Review the underlying records and ask about anything that affects your decision.</p>
        <Link to="/how-it-works" className="text-link">How grades work <ArrowRight size={16} /></Link>
      </div>
    </section>
    <section className="container home-section">
      <div className="compare-callout">
        <div className="compare-callout-copy"><h2>See how two buildings compare</h2>
          <p>Check repairs, noise, and other categories across your shortlist.</p>
          <Link to="/compare" className="button primary">Open comparison <ArrowRight size={17} /></Link>
        </div>
        <table className="sample-comparison">
          <caption>Sample comparison</caption>
          <thead><tr><th scope="col">Category</th>{samplePreviews.map(({ building }) =>
            <th key={building.id} scope="col">{building.address}</th>)}</tr></thead>
          <tbody>{(['maintenance', 'noise'] as const).map(category => <tr key={category}>
            <th scope="row">{categoryLabels[category]}</th>{samplePreviews.map(({ building, grades }) =>
              <td key={building.id}><GradeBadge letter={grades.find(grade => grade.category === category)?.letter ?? null} /></td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </>
}
